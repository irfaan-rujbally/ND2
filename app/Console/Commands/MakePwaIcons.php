<?php

namespace App\Console\Commands;

use GdImage;
use Illuminate\Console\Command;
use RuntimeException;

/**
 * Regenerates public/icons/* -- the home screen icons for the installable app --
 * from a single source image.
 *
 * The source of truth is public/images/icon.ico, the same file the browser
 * favicon points at, so there is only ever one drawing of the tree to keep in
 * step. Everything else is derived:
 *
 *   icon-152/167/152.png  iPad and iPhone home screens, via <link
 *                         rel="apple-touch-icon"> in app.blade.php. iOS ignores
 *                         the manifest's icons array entirely, which is why
 *                         these have to exist separately from the two below.
 *   icon-192/512.png      the manifest's "any" icons: Android home screen, the
 *                         Chrome install prompt, task switchers.
 *   icon-512-maskable.png the manifest's "maskable" icon. Android may crop it to
 *                         whatever shape the launcher uses, guaranteeing only
 *                         that the middle 80% survives, so the emblem is drawn
 *                         smaller here to stay inside that circle. Without a
 *                         maskable icon Android pillarboxes the "any" one inside
 *                         a white blob.
 *
 * Two things are deliberate and easy to undo wrongly:
 *
 *   - The output is opaque, not transparent. iOS composites a transparent home
 *     screen icon onto black, which turns the dark blue trunk into a smudge.
 *   - The background is #f8fafc, the app's own --background token, so the
 *     splash screen the manifest paints from background_color and the first
 *     frame of the app are the same colour.
 *
 * The .ico frame is 154x150, which is smaller than the largest icon written
 * here. Upscaling is why the roots look slightly soft at 512px. Replacing the
 * source with a larger drawing of the same emblem is the only fix; nothing in
 * this command needs to change for it.
 */
class MakePwaIcons extends Command
{
    protected $signature = 'pwa:icons
                            {--source=public/images/icon.ico : Image to derive the set from}';

    protected $description = 'Regenerate the PWA home screen icons in public/icons';

    /** #f8fafc -- HSL(210 40% 98%), the app's --background in light mode. */
    private const BACKGROUND = [0xF8, 0xFA, 0xFC];

    /**
     * Each entry is [filename, pixel size, margin as a fraction of the canvas].
     */
    private const TARGETS = [
        ['icon-152.png', 152, 0.11],
        ['icon-167.png', 167, 0.11],
        ['icon-180.png', 180, 0.11],
        ['icon-192.png', 192, 0.11],
        ['icon-512.png', 512, 0.11],
        ['icon-512-maskable.png', 512, 0.21],
    ];

    public function handle(): int
    {
        if (! extension_loaded('gd')) {
            $this->error('The gd extension is not loaded, so no images can be written.');

            return self::FAILURE;
        }

        $source = base_path($this->option('source'));

        if (! is_file($source)) {
            $this->error("No such file: {$source}");

            return self::FAILURE;
        }

        try {
            $emblem = $this->trimTransparentEdges($this->read($source));
        } catch (RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $directory = public_path('icons');

        if (! is_dir($directory) && ! mkdir($directory, 0755, true)) {
            $this->error("Could not create {$directory}");

            return self::FAILURE;
        }

        $this->line(sprintf(
            'Source: %s (%dx%d after trimming)',
            $this->option('source'),
            imagesx($emblem),
            imagesy($emblem)
        ));

        foreach (self::TARGETS as [$name, $size, $margin]) {
            $path = $directory.DIRECTORY_SEPARATOR.$name;

            imagepng($this->render($emblem, $size, $margin), $path, 9);

            $this->line(sprintf('  %-22s %dx%d', $name, $size, $size));
        }

        $this->info('Done. '.count(self::TARGETS).' icons written to public/icons.');

        return self::SUCCESS;
    }

    /**
     * Decodes the source, unwrapping the .ico container when there is one.
     *
     * GD cannot read .ico, but the format is only a small directory in front of
     * one or more ordinary images, and the frames in this project's file are
     * PNGs -- so the frame can be handed to GD directly.
     */
    private function read(string $path): GdImage
    {
        $data = file_get_contents($path);

        if (strtolower(pathinfo($path, PATHINFO_EXTENSION)) !== 'ico') {
            $image = @imagecreatefromstring($data);

            if ($image === false) {
                throw new RuntimeException("Could not decode {$path}.");
            }

            return $image;
        }

        $header = unpack('vreserved/vtype/vcount', substr($data, 0, 6));

        if (($header['count'] ?? 0) < 1) {
            throw new RuntimeException("{$path} contains no image frames.");
        }

        // Largest frame wins, so adding a bigger one to the .ico is enough to
        // improve every icon here.
        $best = null;

        for ($i = 0; $i < $header['count']; $i++) {
            $entry = unpack(
                'Cwidth/Cheight/Ccolours/Creserved/vplanes/vbpp/Vsize/Voffset',
                substr($data, 6 + $i * 16, 16)
            );

            // A zero in the width or height byte means 256; the field is one byte.
            $area = ($entry['width'] ?: 256) * ($entry['height'] ?: 256);

            if ($best === null || $area > $best['area']) {
                $best = $entry + ['area' => $area];
            }
        }

        $frame = substr($data, $best['offset'], $best['size']);
        $image = @imagecreatefromstring($frame);

        if ($image === false) {
            // BMP/DIB frames carry a truncated header that GD will not accept.
            // Re-saving the source as a PNG is easier than reconstructing it.
            throw new RuntimeException(
                "The frame in {$path} is not a PNG. Export the emblem as a PNG and pass it with --source."
            );
        }

        return $image;
    }

    /**
     * Crops fully transparent borders, so the emblem is centred on its ink
     * rather than on whatever padding the source file happened to carry.
     */
    private function trimTransparentEdges(GdImage $image): GdImage
    {
        $width = imagesx($image);
        $height = imagesy($image);

        $minX = $width;
        $minY = $height;
        $maxX = -1;
        $maxY = -1;

        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                // GD alpha runs 0 (opaque) to 127 (fully transparent). The
                // threshold keeps anti-aliased edge pixels, which are faint but
                // are what stops the crop biting into the drawing.
                if ((imagecolorat($image, $x, $y) >> 24 & 0x7F) < 120) {
                    $minX = min($minX, $x);
                    $minY = min($minY, $y);
                    $maxX = max($maxX, $x);
                    $maxY = max($maxY, $y);
                }
            }
        }

        // A source with no alpha channel has nothing to trim.
        if ($maxX < 0) {
            return $image;
        }

        $cropped = imagecreatetruecolor($maxX - $minX + 1, $maxY - $minY + 1);

        imagealphablending($cropped, false);
        imagesavealpha($cropped, true);
        imagefill($cropped, 0, 0, imagecolorallocatealpha($cropped, 0, 0, 0, 127));
        imagecopy($cropped, $image, 0, 0, $minX, $minY, imagesx($cropped), imagesy($cropped));

        return $cropped;
    }

    /** Draws the emblem centred on an opaque square of the given size. */
    private function render(GdImage $emblem, int $size, float $margin): GdImage
    {
        $canvas = imagecreatetruecolor($size, $size);

        // Blending on so the emblem's alpha is resolved against the background;
        // saving alpha off so the file itself has no alpha channel.
        imagealphablending($canvas, true);
        imagesavealpha($canvas, false);

        imagefilledrectangle(
            $canvas,
            0,
            0,
            $size,
            $size,
            imagecolorallocate($canvas, ...self::BACKGROUND)
        );

        $sourceWidth = imagesx($emblem);
        $sourceHeight = imagesy($emblem);

        // Fit inside the margin box without distorting the aspect ratio.
        $box = (int) round($size * (1 - 2 * $margin));
        $scale = min($box / $sourceWidth, $box / $sourceHeight);

        $width = (int) round($sourceWidth * $scale);
        $height = (int) round($sourceHeight * $scale);

        imagecopyresampled(
            $canvas,
            $emblem,
            (int) round(($size - $width) / 2),
            (int) round(($size - $height) / 2),
            0,
            0,
            $width,
            $height,
            $sourceWidth,
            $sourceHeight
        );

        return $canvas;
    }
}

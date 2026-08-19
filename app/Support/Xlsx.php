<?php

namespace App\Support;

use DateTimeInterface;

/**
 * A minimal .xlsx writer: one sheet, a frozen bold header row, typed cells.
 *
 * Written by hand rather than pulled from a package because this app has no
 * `zip` PHP extension, and phpoffice/phpspreadsheet — which maatwebsite/excel
 * wraps — cannot write xlsx without it. An .xlsx is only a zip of a few XML
 * parts, and every entry here is stored uncompressed, so the archive needs
 * nothing beyond crc32() and pack(). Excel, LibreOffice and Google Sheets all
 * open a stored-entry archive without complaint.
 *
 * Deliberately narrow: no formulas, no merged cells, no multiple sheets. If a
 * second use for this appears and wants any of that, install a real library
 * behind an ext-zip requirement instead of growing this file.
 */
class Xlsx
{
    /** Days between the Excel epoch (1899-12-30) and the Unix epoch. */
    private const EXCEL_EPOCH_OFFSET = 25569;

    private const SECONDS_PER_DAY = 86400;

    /* Indexes into the cellXfs list built by styles(). */
    private const STYLE_DEFAULT = 0;
    private const STYLE_HEADER = 1;
    private const STYLE_DATE = 2;

    /**
     * @param  list<string>  $headers
     * @param  iterable<list<mixed>>  $rows  values may be string|int|float|bool|null|DateTimeInterface
     * @param  list<int>  $widths  column widths in characters, positional
     */
    public function __construct(
        private array $headers,
        private iterable $rows,
        private string $sheetName = 'Sheet1',
        private array $widths = [],
    ) {
    }

    public function toString(): string
    {
        return $this->zip([
            '[Content_Types].xml'      => $this->contentTypes(),
            '_rels/.rels'              => $this->rootRels(),
            'xl/workbook.xml'          => $this->workbook(),
            'xl/_rels/workbook.xml.rels' => $this->workbookRels(),
            'xl/styles.xml'            => $this->styles(),
            'xl/worksheets/sheet1.xml' => $this->sheet(),
        ]);
    }

    /* ------------------------------------------------------------------ XML */

    private function contentTypes(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            .'<Default Extension="xml" ContentType="application/xml"/>'
            .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            .'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            .'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            .'</Types>';
    }

    private function rootRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            .'</Relationships>';
    }

    private function workbook(): string
    {
        // Excel refuses sheet names longer than 31 chars or containing : \ / ? * [ ]
        $name = mb_substr(str_replace([':', '\\', '/', '?', '*', '[', ']'], ' ', $this->sheetName), 0, 31);

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            .' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            .'<sheets><sheet name="'.$this->escape($name).'" sheetId="1" r:id="rId1"/></sheets>'
            .'</workbook>';
    }

    private function workbookRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            .'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            .'</Relationships>';
    }

    private function styles(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>'
            .'<fonts count="2">'
            .'<font><sz val="11"/><name val="Calibri"/></font>'
            .'<font><b/><sz val="11"/><name val="Calibri"/></font>'
            .'</fonts>'
            // Excel requires fill 0 (none) and fill 1 (gray125) to exist, in that order.
            .'<fills count="2"><fill><patternFill patternType="none"/></fill>'
            .'<fill><patternFill patternType="gray125"/></fill></fills>'
            .'<borders count="1"><border/></borders>'
            .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            .'<cellXfs count="3">'
            .'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            .'<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
            .'<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
            .'</cellXfs>'
            .'</styleSheet>';
    }

    private function sheet(): string
    {
        $columnCount = count($this->headers);
        $lastColumn = $this->columnName($columnCount - 1);

        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            // Freeze under the header so it stays put while scrolling 500+ rows.
            .'<sheetViews><sheetView workbookViewId="0">'
            .'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
            .'</sheetView></sheetViews>'
            .$this->columns()
            .'<sheetData>';

        $xml .= $this->row(1, $this->headers, self::STYLE_HEADER);

        $number = 2;
        foreach ($this->rows as $row) {
            $xml .= $this->row($number, $row, self::STYLE_DEFAULT);
            $number++;
        }

        $xml .= '</sheetData>';

        // Filter dropdowns on the header row, so the sheet is usable on arrival.
        if ($columnCount > 0 && $number > 2) {
            $xml .= '<autoFilter ref="A1:'.$lastColumn.($number - 1).'"/>';
        }

        return $xml.'</worksheet>';
    }

    private function columns(): string
    {
        if ($this->widths === []) {
            return '';
        }

        $xml = '<cols>';
        foreach ($this->widths as $index => $width) {
            $column = $index + 1;
            $xml .= '<col min="'.$column.'" max="'.$column.'" width="'.$width.'" customWidth="1"/>';
        }

        return $xml.'</cols>';
    }

    /** @param  list<mixed>  $values */
    private function row(int $number, array $values, int $style): string
    {
        $xml = '<row r="'.$number.'">';

        foreach (array_values($values) as $index => $value) {
            $xml .= $this->cell($this->columnName($index).$number, $value, $style);
        }

        return $xml.'</row>';
    }

    private function cell(string $reference, mixed $value, int $style): string
    {
        if ($value === null || $value === '') {
            return '';  // An absent cell renders as blank; writing one costs bytes for nothing.
        }

        if ($value instanceof DateTimeInterface) {
            return '<c r="'.$reference.'" s="'.self::STYLE_DATE.'"><v>'.$this->serial($value).'</v></c>';
        }

        if (is_bool($value)) {
            return '<c r="'.$reference.'" s="'.$style.'" t="b"><v>'.($value ? 1 : 0).'</v></c>';
        }

        if (is_int($value) || is_float($value)) {
            return '<c r="'.$reference.'" s="'.$style.'"><v>'.$value.'</v></c>';
        }

        return '<c r="'.$reference.'" s="'.$style.'" t="inlineStr">'
            .'<is><t xml:space="preserve">'.$this->escape((string) $value).'</t></is></c>';
    }

    /** Excel counts days from 1899-12-30; the time of day is the fractional part. */
    private function serial(DateTimeInterface $date): string
    {
        $days = $date->getTimestamp() / self::SECONDS_PER_DAY + self::EXCEL_EPOCH_OFFSET;

        return rtrim(rtrim(number_format($days, 6, '.', ''), '0'), '.');
    }

    /** 0 -> A, 25 -> Z, 26 -> AA */
    private function columnName(int $index): string
    {
        $name = '';

        for ($i = $index; $i >= 0; $i = intdiv($i, 26) - 1) {
            $name = chr(65 + $i % 26).$name;
        }

        return $name;
    }

    private function escape(string $value): string
    {
        // Control characters below 0x20 (bar tab/newline/return) are illegal in
        // XML 1.0 and make Excel report the file as corrupt, so drop them.
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $value) ?? $value;

        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    /* ------------------------------------------------------------------ ZIP */

    /**
     * Builds a zip archive with every entry stored uncompressed.
     *
     * @param  array<string, string>  $files  path within the archive => contents
     */
    private function zip(array $files): string
    {
        $local = '';
        $central = '';
        $offset = 0;
        $count = 0;

        [$time, $date] = $this->dosTimestamp();

        foreach ($files as $name => $contents) {
            $crc = crc32($contents);
            $length = strlen($contents);

            // Local file header: version 2.0, no flags, stored (method 0).
            $header = pack('VvvvvvVVVvv', 0x04034b50, 20, 0, 0, $time, $date, $crc, $length, $length, strlen($name), 0);

            $local .= $header.$name.$contents;

            // Central directory entry, pointing back at that header's offset.
            $central .= pack(
                'VvvvvvvVVVvvvvvVV',
                0x02014b50, 20, 20, 0, 0, $time, $date, $crc, $length, $length,
                strlen($name), 0, 0, 0, 0, 32, $offset
            ).$name;

            $offset += strlen($header) + strlen($name) + $length;
            $count++;
        }

        $end = pack('VvvvvVVv', 0x06054b50, 0, 0, $count, $count, strlen($central), $offset, 0);

        return $local.$central.$end;
    }

    /** @return array{0: int, 1: int} MS-DOS packed time and date. */
    private function dosTimestamp(): array
    {
        $now = getdate();

        $time = ($now['hours'] << 11) | ($now['minutes'] << 5) | intdiv($now['seconds'], 2);
        $date = (max($now['year'] - 1980, 0) << 9) | ($now['mon'] << 5) | $now['mday'];

        return [$time, $date];
    }
}

{{--
    Hand-written rather than built from Laravel's markdown mail components, and
    laid out with tables and inline styles rather than the app's Tailwind.

    Mail clients are not browsers: Outlook renders with Word's engine, Gmail
    strips <style> blocks from forwarded copies, and none of them load an
    external stylesheet. Inline attributes on nested tables is the one layout
    that survives all of them.
--}}
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{ $title }}</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; -webkit-text-size-adjust:100%;">

    {{-- Preheader: the grey line of text the inbox shows next to the subject.
         Hidden in the body itself, otherwise the first words of the announcement
         would be repeated at the top of the message. --}}
    <div style="display:none; font-size:1px; color:#f8fafc; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
        {{ \Illuminate\Support\Str::limit(strip_tags($description ?? ''), 120) }}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f8fafc;">
        <tr>
            <td align="center" style="padding:24px 12px;">

                <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
                       style="width:100%; max-width:600px; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;">

                    {{-- Brand bar. #1b2a8f is the app's --primary and its theme-color. --}}
                    <tr>
                        <td style="background-color:#1b2a8f; padding:20px 28px;">
                            <span style="font-family:Helvetica,Arial,sans-serif; font-size:16px; font-weight:bold; color:#ffffff; letter-spacing:0.3px;">
                                Nouveaux Démocrates
                            </span>
                        </td>
                    </tr>

                    @if ($imageUrl)
                        <tr>
                            <td style="padding:0;">
                                {{--
                                    Width is set as an attribute as well as in the
                                    style, because Outlook ignores max-width. alt
                                    text carries the title so the message still
                                    reads when images are blocked, which is the
                                    default in most corporate clients.
                                --}}
                                <img src="{{ $imageUrl }}" alt="{{ $title }}" width="600"
                                     style="display:block; width:100%; max-width:600px; height:auto; border:0;" />
                            </td>
                        </tr>
                    @endif

                    <tr>
                        <td style="padding:28px;">
                            <h1 style="margin:0 0 16px; font-family:Helvetica,Arial,sans-serif; font-size:22px; line-height:1.3; color:#0f172a;">
                                {{ $title }}
                            </h1>

                            {{-- Skipped entirely for the members whose first name
                                 was never captured, rather than greeting someone
                                 as "Bonjour ,". --}}
                            @if (filled($greetingName))
                                <p style="margin:0 0 16px; font-family:Helvetica,Arial,sans-serif; font-size:15px; line-height:1.65; color:#33415a;">
                                    Bonjour {{ $greetingName }},
                                </p>
                            @endif

                            @if (filled($description))
                                {{--
                                    nl2br over an escaped string: the body is
                                    plain text typed into a textarea, so line
                                    breaks are the only formatting to preserve and
                                    everything else must not be interpreted as
                                    markup.
                                --}}
                                <div style="font-family:Helvetica,Arial,sans-serif; font-size:15px; line-height:1.65; color:#33415a;">
                                    {!! nl2br(e($description)) !!}
                                </div>
                            @endif
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:0 28px 28px;">
                            <hr style="border:0; border-top:1px solid #e2e8f0; margin:0 0 16px;" />
                            <p style="margin:0; font-family:Helvetica,Arial,sans-serif; font-size:12px; line-height:1.6; color:#64748b;">
                                Ce message a été envoyé automatiquement par le secrétariat des Nouveaux
                                Démocrates. Cette adresse ne reçoit pas de courrier : merci de ne pas y
                                répondre.
                            </p>
                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>

</body>
</html>

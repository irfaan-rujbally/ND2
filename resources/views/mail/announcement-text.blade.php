{{--
    Plain text alternative.

    Worth the twenty lines: a mass mailing with no text/plain part scores worse
    with spam filters than the same message with one, and this is mail going to
    several hundred addresses at once. It is also what a screen reader and a
    watch notification actually read out.

    Everything is printed with {!! !!} rather than {{ }} on purpose. Blade's
    escaping is HTML escaping, and this file is not HTML -- an apostrophe typed
    into the description came out as "L&#039;assemblee" in the delivered text
    part. Nothing here is ever parsed as markup, so there is nothing to escape
    against.
--}}
{!! $title !!}
{{ str_repeat('=', mb_strlen($title)) }}
@if (filled($greetingName))

Bonjour {!! $greetingName !!},
@endif
@if (filled($description))

{!! $description !!}
@endif
@if ($imageUrl)

Image : {!! $imageUrl !!}
@endif

--
Ce message a été envoyé automatiquement par le secrétariat des Nouveaux
Démocrates. Cette adresse ne reçoit pas de courrier : merci de ne pas y
répondre.

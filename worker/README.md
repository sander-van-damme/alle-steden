# Alle Steden API als aparte Worker

Voer vanaf de repositoryroot `npm run build:worker` uit. Het commando maakt
eerst de gewone sitebuild en pakt de gegenereerde steden- en linkcatalogus
mee in een zelfstandig JavaScript-bestand. De vastgezette Wrangler-versie
bundelt dat bestand in `worker/dist/` met `--dry-run`. De eerste uitvoering
kan de npm-registry nodig hebben voor Wrangler; een Cloudflare-account,
sleutel of login is niet nodig.

De Worker voert dezelfde tien handlers uit als Cloudflare Pages Functions.
De catalogi zijn intern beschikbaar voor de handlers, niet op publieke
Worker-routes. Onbekende paden krijgen 404. De bestaande methode-, cache- en
validatieregels blijven gelden, inclusief de beperking voor linkcontrole
vanaf andere sites. Er zijn geen CORS-headers, workers.dev- of preview-URL’s
ingeschakeld. De huidige Pages-site verandert niet.

Een eventuele activering vraagt afzonderlijke Cloudflare-configuratie en,
voor een externe browserorigin, een expliciete koppeling met doordachte CORS-
en linkcontrole-regels. `UIT_API_KEY` blijft een optioneel servergeheim voor
uitsluitend een later geautoriseerde UiT-koppeling; het zit niet in de build.

De Node-test draait in `npm test`. Voor de optionele runtimeproef op het
gebouwde bestand: gebruik Miniflare 5 (bv. `5.20261123.1-beta`, meegeleverd
met de vastgezette Wrangler) en voer `node tests/worker-api-workerd.mjs` uit.
`MINIFLARE_MODULE` kan naar een installatie buiten de repository verwijzen.
De test gebruikt workerd met vaste bronantwoorden en geen Cloudflare-account.

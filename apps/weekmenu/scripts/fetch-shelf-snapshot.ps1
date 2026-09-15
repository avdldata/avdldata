<#
.SYNOPSIS
    Haalt een PrijsProfeet schapmomentopname op voor Albert Heijn en Jumbo.

.DESCRIPTION
    Schaprecords zijn gewone schapprijzen, geen aanbiedingen. Ze worden hier
    opgehaald omdat ze een EAN en een stabiele sleutel dragen voor producten die
    NIET in de folder staan — de enige manier om de identiteit van een product
    te leren voordat het in de aanbieding komt.

    Het script schrijft één bestand in exact het formaat dat
    PRIJSPROFEET_SNAPSHOT_SCHEMA.md beschrijft:

        { "fetched_at": ..., "source": "PRIJSPROFEET", "products": [ ... ] }

    Daarna:  pnpm shelf:import data/external/shelf-snapshot.json

.PARAMETER ApiKey
    Optioneel. De publieke endpoints werken zonder sleutel; een gratis sleutel
    verhoogt alleen de limiet. Geef hem mee via -ApiKey of zet de
    omgevingsvariabele PRIJSPROFEET_API_KEY. Zet hem NIET in dit bestand en
    commit hem nergens.

.PARAMETER BaseUrl
    De API-basis. Standaard https://api.prijsprofeet.nl. Pas aan als de
    documentatie een ander host- of padvoorvoegsel noemt.

.PARAMETER OutFile
    Doelbestand. Standaard data/external/shelf-snapshot.json.

.PARAMETER DelayMs
    Pauze tussen twee verzoeken. Standaard 400 ms. Verlaag dit niet zonder de
    limieten van de aanbieder te controleren; de gratis laag is een gunst, geen
    recht.

.EXAMPLE
    .\scripts\fetch-shelf-snapshot.ps1
    .\scripts\fetch-shelf-snapshot.ps1 -ApiKey $env:PRIJSPROFEET_API_KEY
#>
[CmdletBinding()]
param(
    [string] $ApiKey = $env:PRIJSPROFEET_API_KEY,
    [string] $BaseUrl = 'https://api.prijsprofeet.nl',
    [string] $OutFile = 'data/external/shelf-snapshot.json',
    [int]    $DelayMs = 400,
    [int]    $PageSize = 250,
    [int]    $MaxPages = 400,
    [string[]] $Retailers = @('albert_heijn', 'jumbo')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Vanuit apps/weekmenu draaien, ongeacht waar de shell staat.
$repoApp = Split-Path -Parent $PSScriptRoot
Push-Location $repoApp
try {
    $headers = @{ 'Accept' = 'application/json' }
    if ($ApiKey) {
        $headers['X-API-Key'] = $ApiKey
        Write-Host 'API-sleutel gevonden; limiet is verhoogd.' -ForegroundColor DarkGray
    }
    else {
        Write-Host 'Geen API-sleutel. De publieke endpoints werken, met een lagere limiet.' -ForegroundColor DarkGray
    }

    $all = [System.Collections.Generic.List[object]]::new()
    $seen = [System.Collections.Generic.HashSet[string]]::new()

    foreach ($retailer in $Retailers) {
        Write-Host "`n$retailer" -ForegroundColor Cyan
        $page = 1
        $kept = 0

        while ($page -le $MaxPages) {
            # De schaprecords: huidige reguliere prijzen, geen aanbiedingen.
            $query = "retailer=$retailer&promotion_status=shelf&page=$page&page_size=$PageSize"
            $url = "$BaseUrl/v1/products?$query"

            try {
                $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -TimeoutSec 60
            }
            catch {
                $code = $null
                if ($_.Exception.PSObject.Properties.Name -contains 'Response' -and $_.Exception.Response) {
                    $code = [int] $_.Exception.Response.StatusCode
                }
                if ($code -eq 429) {
                    # Netjes wachten in plaats van doorrammen. Een rate limit is
                    # een verzoek, geen obstakel.
                    Write-Warning 'Rate limit geraakt; 30 seconden wachten.'
                    Start-Sleep -Seconds 30
                    continue
                }
                Write-Warning "Verzoek mislukt ($code) op pagina $page : $($_.Exception.Message)"
                break
            }

            # De API kan de lijst onder verschillende sleutels teruggeven.
            $items = $null
            foreach ($key in @('products', 'results', 'data', 'items')) {
                if ($response.PSObject.Properties.Name -contains $key) {
                    $items = $response.$key
                    break
                }
            }
            if ($null -eq $items -and $response -is [System.Array]) { $items = $response }
            if ($null -eq $items -or $items.Count -eq 0) { break }

            foreach ($item in $items) {
                # Ontdubbelen op de stabiele sleutel; twee pagina's kunnen
                # overlappen als de bron tussendoor ververst.
                $key = $null
                foreach ($k in @('base_product_id', 'product_id', 'ean')) {
                    if ($item.PSObject.Properties.Name -contains $k -and $item.$k) {
                        $key = "$retailer|$($item.$k)"
                        break
                    }
                }
                if ($null -eq $key) { $key = "$retailer|$([guid]::NewGuid())" }
                if ($seen.Add($key)) {
                    $all.Add($item) | Out-Null
                    $kept++
                }
            }

            Write-Host ("  pagina {0,3}: {1,4} records, {2,6} totaal" -f $page, $items.Count, $kept)
            if ($items.Count -lt $PageSize) { break }

            $page++
            Start-Sleep -Milliseconds $DelayMs
        }
    }

    if ($all.Count -eq 0) {
        Write-Error @'
Geen records opgehaald.

Controleer:
  1. of $BaseUrl en het pad kloppen met de actuele PrijsProfeet-documentatie;
  2. of de parameternaam voor de status werkelijk promotion_status=shelf is;
  3. of de lijst onder een andere sleutel dan products/results/data/items zit.

Schrijf liever geen bestand dan een leeg bestand: een lege momentopname ziet er
stroomafwaarts uit als "geen aanbiedingen deze week" en dat is de ene fout die
niemand opmerkt.
'@
        exit 1
    }

    $snapshot = [ordered]@{
        fetched_at = (Get-Date).ToString('o')
        source     = 'PRIJSPROFEET'
        products   = $all
    }

    $dir = Split-Path -Parent $OutFile
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    # UTF-8 zonder BOM. De promotiemomentopname had er een en het schema haalt
    # hem weg, maar hem niet schrijven is netter dan hem opruimen.
    $json = $snapshot | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText(
        (Join-Path $repoApp $OutFile),
        $json,
        (New-Object System.Text.UTF8Encoding $false)
    )

    Write-Host "`n$($all.Count) records geschreven naar $OutFile" -ForegroundColor Green
    Write-Host "`nVolgende stap:" -ForegroundColor Cyan
    Write-Host "  pnpm shelf:import $OutFile"
}
finally {
    Pop-Location
}

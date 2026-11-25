# Third party data and services

pitwall's own code is MIT licensed. The data and services below keep their own terms.

| What | Used for | License / terms |
|---|---|---|
| [OBDex](https://github.com/foerbsnavi/OBDex), commit `9ba1ffa` | English trouble code texts (descriptions shortened), embedded in `packages/dtc-data/data` | Data CC0-1.0, tools MIT |
| [OpenEV Data](https://github.com/open-ev-data/open-ev-data-dataset), v1.24.0 | Electric car specifications (reduced), embedded in `packages/ev-data/data` | CDLA-Permissive-2.0, text in `packages/ev-data/data/LICENCE-OpenEV-Data.txt`. Consumption values are derived by us from capacity and rated range |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Map and routing data | ODbL 1.0. **OSM data stays ODbL**; the MIT license covers only pitwall's code |
| [OpenFreeMap](https://openfreemap.org/) / [OpenMapTiles](https://openmaptiles.org/) | Map tiles and style | [Terms](https://openfreemap.org/tos/). Attribution always shown. Tiles are not pre-cached |
| [openrouteservice](https://openrouteservice.org/) by HeiGIT | Routing and address search with your own key | Their terms of service and quotas |
| [Open Charge Map](https://openchargemap.org/) | Charging stations with your own key | [Terms](https://openchargemap.org/site/about/terms); each record's data provider and license are shown with the results |
| [Manrope](https://github.com/sharanda/manrope) | Typeface | SIL OFL 1.1 |
| [Lucide](https://lucide.dev/) | Icons | ISC |

The Turkish trouble code texts in `packages/dtc-data/data/dtc-tr.json` were written for this project with AI assistance and are released under CC0-1.0. They have not been checked against the SAE J2012 text.

Software dependencies are listed in each `package.json` and keep their own licenses.

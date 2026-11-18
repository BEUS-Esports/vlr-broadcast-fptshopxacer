# ZIP Bundle for importing Teams and Players

STATUS: Done ([#11](https://github.com/BEUS-Esports/vlr-broadcast-fptshopxacer/pull/11))

## Goal

- Add import feature to Teams and Players, increasing the workflow speed
- The import format will be ZIP:

```bash
# eza --tree zip_bundle/
zip_bundle
├── player_images
│   └── USECRookieNguyen#USEC.jpg
├── players.csv
├── team_logos
│   ├── black
│   │   └── USEC.png
│   ├── normal
│   │   └── USEC.png
│   └── white
│       └── USEC.png
└── teams.csv
```

```bash
# cat players.csv

display_name,full_name,riot_id
USECRookieNguyen,Nguyễn Hữu Quốc Thắng,USECRookieNguyen#USEC
```

```bash
# cat teams.csv

team_name,team_tag
VNUHCM – University of Science Esports Club,USEC
```

## Inspiration

HCMUSEC's TFT Broadcast Tool: <https://github.com/USEC-US/tft-broadcast/tree/main/src/lib/server/import>
# DreamPlay PNR Live Page (Netlify)

This folder contains:
- `index.html` (static claim page)
- `netlify/functions/pnr-sign.js` (Netlify Function that signs claim payloads)
- `netlify.toml` (tells Netlify where the site + functions are)
- `package.json` (installs `ethers` for the function)

## Required Netlify Environment Variables
- OPERATOR_PK = (your operator private key, **no quotes**)
Optional:
- ORIGIN_ALLOW = https://<your-site-name>.netlify.app

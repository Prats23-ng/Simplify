/* markets-sample.js
 * DESIGN-PREVIEW DATA ONLY. These numbers are illustrative placeholders, not real quotes.
 * The UI always labels them "Sample data". Delete this file (and its <script> tag) when the live
 * feed (api/markets.js, api/movers.js) is wired in; markets.js never falls back to it once live.
 */
(function (root) {
  function ramp(n, from, to) { // n values from `from` to `to`, evenly spaced
    var out = [];
    for (var i = 0; i < n; i++) out.push(n === 1 ? from : from + (to - from) * (i / (n - 1)));
    return out;
  }
  var gridPct = ramp(32, 2.46, 0.05).concat([0], ramp(17, -0.1, -2.34));

  root.MARKETS_SAMPLE = {
    sample: true,
    asOf: '2026-10-14T10:00:00.000Z',      // 3:30 pm IST
    fetchedAt: '2026-10-14T10:00:00.000Z',
    items: [
      { id: 'nifty',     label: 'Nifty 50',  price: 24612.30, change: 213.40, changePct: 0.87,
        spark: [24050,24020,24080,24010,24120,24090,24170,24150,24230,24200,24260,24240,24330,24300,24390,24360,24450,24420,24398.90,24612.30] },
      { id: 'sensex',    label: 'Sensex',    price: 80256.12, change: 700.15, changePct: 0.88,
        spark: [78600,78520,78700,78580,78850,78790,78980,78900,79120,79050,79210,79160,79340,79290,79470,79400,79600,79520,79555.97,80256.12] },
      { id: 'banknifty', label: 'Bank Nifty', price: 52341.90, change: 513.10, changePct: 0.99,
        spark: [51100,51020,51250,51140,51400,51330,51520,51450,51660,51590,51740,51680,51900,51830,52010,51940,52120,51990,51828.80,52341.90] },
      { id: 'vix',       label: 'India VIX', price: 12.48, change: -0.92, changePct: -6.87,
        spark: [13.9,14.2,13.8,14.0,13.6,13.9,13.5,13.7,13.3,13.6,13.2,13.5,13.1,13.4,13.0,13.3,13.2,13.5,13.40,12.48] },
      { id: 'usdinr',    label: 'USD/INR',   price: 83.21, change: -0.14, changePct: -0.17,
        spark: [83.55,83.50,83.58,83.46,83.52,83.44,83.49,83.40,83.46,83.38,83.44,83.36,83.41,83.34,83.40,83.33,83.38,83.36,83.35,83.21] }
    ],
    movers: {
      advancers: 32, decliners: 17, unchanged: 1,
      grid: gridPct,
      gainers: [
        { name: 'HDFC Bank',      price: 1674.20, changePct: 2.46 },
        { name: 'ICICI Bank',     price: 1248.30, changePct: 2.12 },
        { name: 'Tata Motors',    price: 987.65,  changePct: 1.89 },
        { name: 'Larsen & Toubro',price: 3584.10, changePct: 1.56 },
        { name: 'Power Grid',     price: 305.40,  changePct: 1.42 }
      ],
      losers: [
        { name: 'TCS',            price: 3889.50, changePct: -2.34 },
        { name: 'Infosys',        price: 1462.20, changePct: -1.98 },
        { name: 'Reliance Ind.',  price: 2912.40, changePct: -1.76 },
        { name: 'ITC',            price: 452.10,  changePct: -1.32 },
        { name: 'HUL',            price: 2498.75, changePct: -1.18 }
      ]
    },
    sectors: [
      { name: 'Banking', changePct: 1.24 }, { name: 'IT',     changePct: -1.36 },
      { name: 'Pharma',  changePct: 0.82 }, { name: 'Auto',   changePct: 1.10 },
      { name: 'FMCG',    changePct: -0.48 },{ name: 'Metals', changePct: 1.92 },
      { name: 'Energy',  changePct: 0.64 }, { name: 'Realty', changePct: -0.73 }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);

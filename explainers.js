/* simplify - Learn: evergreen explainers with diagrams. Hand-written, so no AI and nothing to review each day.
   Drawn with the same blocks as The Weekly. Every number is a labelled illustration, never a forecast. */
(function(){
  'use strict';
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  var ILL = 'Illustration with round numbers, not a forecast.';

  var LIST = [
    { id: 'repo-rate', concept: 'repo-rate', title: 'What is the repo rate, and why does it move your EMI?', dek: 'The one number the RBI sets that quietly reaches your loan, your deposits and the prices you pay.', mins: 3, body: [
      { type: 'p', text: 'The repo rate is the interest rate at which the RBI lends money to banks for the short term. Think of it as the starting price of money in the economy: when it changes, almost every other interest rate follows.' },
      { type: 'flow', title: 'How a change travels to you', steps: [
        { title: 'RBI changes the repo rate', text: 'The Monetary Policy Committee decides, usually every two months.' },
        { title: 'Banks\' own cost of money changes', text: 'Borrowing from the RBI becomes dearer or cheaper.' },
        { title: 'Loan rates follow', text: 'Home and other loans linked to the repo rate reset, often within a few months.' },
        { title: 'Your EMI or loan term changes', text: 'Either the monthly payment moves or the loan runs longer or shorter.' } ] },
      { type: 'compare', title: 'A 0.5 percentage point difference on a home loan', note: 'Illustration: ₹50 lakh, 20 years. ' + ILL, left: { label: 'Rate 8.5%', value: '₹43,391', note: 'EMI per month' }, right: { label: 'Rate 8.0%', value: '₹41,822', note: 'EMI per month, about ₹1,569 less' } },
      { type: 'h', text: 'Why does the RBI do this?' },
      { type: 'p', text: 'To keep price rises (inflation) in check. A higher repo rate makes borrowing costlier, so people and firms spend less and prices cool. A lower rate does the opposite and supports growth.' },
      { type: 'takeaways', items: ['Higher repo rate usually means costlier loans and better returns on deposits.', 'Lower repo rate usually means cheaper loans and lower deposit rates.', 'Check whether your loan is linked to the repo rate; fixed-rate loans do not move.'] } ] },

    { id: 'inflation', concept: 'inflation', title: 'Inflation: why ₹100 buys less every year', dek: 'What a rise in prices does to your savings, and why a little of it is normal.', mins: 3, body: [
      { type: 'p', text: 'Inflation is the rate at which prices in general go up. If it is 6% a year, something that costs ₹100 today costs about ₹106 next year. Your money has not shrunk, but it buys less.' },
      { type: 'compare', title: 'What ₹100 can buy in 10 years', note: 'Illustration: prices rising 6% every year. ' + ILL, left: { label: 'Today', value: '₹100', note: 'buys a basket of goods' }, right: { label: 'In 10 years', value: '≈ ₹56', note: 'worth of that same basket' } },
      { type: 'flow', title: 'Why prices rise', steps: [
        { title: 'Demand grows faster than supply', text: 'More people want things than there are things to buy.' },
        { title: 'Costs go up', text: 'Fuel, food, wages or imports become dearer, and firms pass it on.' },
        { title: 'Prices rise across the economy', text: 'The RBI watches this through the consumer price index (CPI).' },
        { title: 'The RBI responds', text: 'It can raise interest rates to cool demand.' } ] },
      { type: 'takeaways', items: ['Savings that earn less than inflation lose buying power.', 'Some inflation is normal; the worry is when it runs fast or unpredictably.', 'The RBI aims to keep it near a target, using interest rates as its main tool.'] } ] },

    { id: 'bond-yields', concept: 'bond-yields', title: 'Bond yields: the seesaw with bond prices', dek: 'Why news that says "yields rose" is also saying "bond prices fell".', mins: 3, body: [
      { type: 'p', text: 'A bond is a loan you give to a government or company. It pays a fixed amount of interest each year (the coupon) and returns your money at the end. The yield is the return you actually earn given the price you pay for it.' },
      { type: 'compare', title: 'Same bond, different price', note: 'Illustration: a ₹100 bond paying ₹7 a year. Yield shown is the simple current yield. ' + ILL, left: { label: 'Bought at ₹100', value: '7.0%', note: 'yield' }, right: { label: 'Bought at ₹95', value: '≈ 7.4%', note: 'yield: same ₹7, smaller price' } },
      { type: 'flow', title: 'Why the seesaw works', steps: [
        { title: 'Interest rates rise', text: 'New bonds now pay more than older ones.' },
        { title: 'Old bonds look less attractive', text: 'Buyers will only take them at a lower price.' },
        { title: 'Price falls, yield rises', text: 'The fixed ₹7 is now a bigger share of a smaller price.' } ] },
      { type: 'takeaways', items: ['Yield up means price down, and the reverse.', 'The government bond yield is a benchmark that many other rates follow.', 'Bond prices matter to banks and funds that hold lots of them.'] } ] },

    { id: 'ipo', concept: 'ipo', title: 'How an IPO works', dek: 'From a private company to a share you can buy on the exchange.', mins: 3, body: [
      { type: 'p', text: 'An IPO (initial public offering) is when a company sells shares to the public for the first time, usually to raise money for growth or so early investors can sell some of their stake.' },
      { type: 'flow', title: 'The journey of an IPO', steps: [
        { title: 'The company files its plans', text: 'It submits a detailed draft offer document to SEBI, the regulator.' },
        { title: 'The price band is announced', text: 'Investors learn the range in which they can bid, and the opening and closing dates.' },
        { title: 'Investors apply', text: 'Retail, institutional and other investors bid during a few days.' },
        { title: 'Shares are allotted', text: 'If the issue is oversubscribed, not everyone gets shares.' },
        { title: 'Listing day', text: 'The shares begin trading on the stock exchange and the price moves with demand.' } ] },
      { type: 'takeaways', items: ['The listing price can be higher or lower than the issue price.', 'Read the risk section of the offer document before applying.', 'A popular IPO is not the same as a good business at a fair price.'] } ] },

    { id: 'gdp', concept: 'gdp', title: 'GDP: how big is the economy?', dek: 'One number for everything a country produces, and what it leaves out.', mins: 3, body: [
      { type: 'p', text: 'GDP (gross domestic product) is the total value of goods and services produced in a country in a period. When people say the economy "grew 7%", they usually mean GDP, after adjusting for price rises.' },
      { type: 'flow', title: 'Four things that add up to GDP', steps: [
        { title: 'Household spending', text: 'What people spend on food, rent, travel and more.' },
        { title: 'Business investment', text: 'Factories, machines, software and new buildings.' },
        { title: 'Government spending', text: 'Roads, defence, salaries and services.' },
        { title: 'Exports minus imports', text: 'What we sell abroad less what we buy from abroad.' } ] },
      { type: 'takeaways', items: ['Growth rate is the change in GDP from one period to the next.', 'GDP does not show how evenly the gains are shared.', 'Markets watch it because it shapes company earnings and policy.'] } ] },

    { id: 'fii-flows', concept: 'fii-flows', title: 'FII flows: why foreign money moves the market', dek: 'What it means when "foreign investors sold" shows up in the headline.', mins: 3, body: [
      { type: 'p', text: 'FIIs (foreign institutional investors) are large overseas funds that buy and sell Indian shares and bonds. Because they trade in big amounts, their buying or selling can move prices and even the rupee.' },
      { type: 'flow', title: 'Why they buy or sell', steps: [
        { title: 'A global event or rate move', text: 'For example higher US interest rates make safer assets there more attractive.' },
        { title: 'Funds rebalance', text: 'They move money between countries based on returns and risk.' },
        { title: 'Indian markets feel it', text: 'Heavy selling can push prices down; heavy buying can lift them.' },
        { title: 'The rupee reacts too', text: 'Money leaving India means selling rupees to buy dollars, which can weaken the rupee.' } ] },
      { type: 'takeaways', items: ['FII flows are one force among many, alongside domestic investors.', 'A single day of selling rarely tells you much; look at trends.', 'Domestic investors, such as mutual funds, can cushion foreign selling.'] } ] },

    { id: 'compounding', concept: null, title: 'Compounding: why starting early matters', dek: 'Interest on your interest is the quiet engine behind long-term wealth.', mins: 3, body: [
      { type: 'p', text: 'With compounding, the returns you earn are added to your money and start earning returns too. The longer it runs, the faster it grows, which is why time often matters more than the amount.' },
      { type: 'bars', title: 'What ₹10,000 becomes (in ₹)', note: 'Illustration: 12% a year, never withdrawn. Real returns vary and are not guaranteed. ' + ILL, items: [{ label: 'After 10 years', value: 31058 }, { label: 'After 20 years', value: 96463 }, { label: 'After 30 years', value: 299599 }] },
      { type: 'takeaways', items: ['The last 10 years add far more than the first 10.', 'Starting a few years earlier can beat investing more later.', 'Fees and taxes also compound, so they matter too.'] } ] }
  ];

  var openId = null;
  function render(){
    var el = document.getElementById('learn-body'); if(!el) return;
    var W = window.SimplifyWeekly;
    var ex = null; LIST.forEach(function(x){ if(x.id === openId) ex = x; });
    if(ex && W){
      el.innerHTML = '<button type="button" class="wk-back" onclick="SimplifyLearn.back()">← All explainers</button><article class="wk-art"><div class="wk-kicker">Explainer · ' + ex.mins + ' min</div><h1 class="wk-title">' + esc(ex.title) + '</h1><p class="wk-stand">' + esc(ex.dek) + '</p><div class="wk-meta">Evergreen guide · written by the simplify team</div>' + W.blocksHTML(ex.body) +
        '<p class="wk-disc">General education, not investment, tax or legal advice. Examples use simple round numbers.</p></article>';
      return;
    }
    el.innerHTML = '<div class="wk-list-h">Learn</div><div class="wk-list-s">The ideas behind the headlines, one picture at a time.</div><div class="ln-grid">' + LIST.map(function(x){
      return '<button type="button" class="ln-card" onclick="SimplifyLearn.open(\'' + x.id + '\')"><span class="ln-t">' + esc(x.title) + '</span><span class="ln-d">' + esc(x.dek) + '</span><span class="ln-m">' + x.mins + ' min · with diagram →</span></button>';
    }).join('') + '</div>';
  }
  function open(id){ openId = id; var b = document.querySelector('.nav-item[data-view="learn"]'); if(window.switchView && b) switchView('learn', b); render(); try { if(window.SimplifyTrack) SimplifyTrack.event('explainer_open', { id: String(id).slice(0, 40) }); } catch (e) {} }
  function back(){ openId = null; render(); var c = document.getElementById('view-container'); if(c) c.scrollTop = 0; }
  function forConcept(key){ var r = null; LIST.forEach(function(x){ if(x.concept === key) r = x; }); return r; }

  var css = '.ln-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;} .ln-card{display:flex;flex-direction:column;gap:8px;text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:20px;cursor:pointer;font-family:inherit;color:inherit;} .ln-card:hover{border-color:var(--primary);} .ln-t{font-size:17px;font-weight:800;line-height:1.25;} .ln-d{font-size:14px;color:#4B5563;line-height:1.5;} .ln-m{font-size:12.5px;font-weight:700;color:var(--primary);margin-top:auto;}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  window.SimplifyLearn = { render: render, open: open, back: back, forConcept: forConcept, list: LIST };
})();

async function renderTaxBrackets(lang = "tr") {
  const container = document.getElementById("tax-brackets-container");
  if (!container) return;

  const [taxRes, uiRes] = await Promise.all([
    fetch("content/income-tax-current.json"),
    fetch("content/pay-ui.json")
  ]);

  const taxData = await taxRes.json();
  const payUiAll = await uiRes.json();
  const ui = payUiAll[lang] || payUiAll.de || payUiAll.en;

  const formatEur = (val) =>
    new Intl.NumberFormat("de-AT", { maximumFractionDigits: 0 }).format(val);

  const rowsHtml = taxData.brackets
    .map((b) => {
      let label = "";
      if (b.lower === 0) {
        label = ui.firstBand.replace("{amount}", `€ ${formatEur(b.upper)}`);
      } else if (b.upper === null) {
        label = ui.overBand.replace("{lower}", `€ ${formatEur(b.lower)}`);
      } else {
        label = ui.rangeBand
          .replace("{lower}", `€ ${formatEur(b.lower)}`)
          .replace("{upper}", `€ ${formatEur(b.upper)}`);
      }
      return `
        <tr>
          <td>${label}</td>
          <td><strong>${b.rate}%</strong></td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <h3>${ui.taxTitle} (${taxData.taxYear})</h3>
    <p>${ui.taxIntro}</p>
    <table>
      <tbody>${rowsHtml}</tbody>
    </table>
    <small>
      ${ui.taxNote} ·
      <a href="${taxData.source.url}" target="_blank" rel="noopener">${taxData.source.name}</a>
    </small>
  `;
}
/**
 * charts.js — Animated bar chart rendering
 */
const Charts = {
  // highlightAnswer may be a single option or an array of options (multi-select).
  render(container, options, counts, totalVotes, highlightAnswer = null) {
    if (!container) return;
    container.innerHTML = '';
    const total = totalVotes || Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const mine  = highlightAnswer == null ? []
                : Array.isArray(highlightAnswer) ? highlightAnswer : [highlightAnswer];

    options.forEach(opt => {
      const votes = counts[opt] || 0;
      const pct   = Math.round((votes / total) * 100);
      const isAns = mine.includes(opt);

      const row = document.createElement('div');
      row.className = 'chart-bar-row';
      row.innerHTML = `
        <div class="chart-label">
          <span>${opt}</span>
          <span class="chart-label-pct">${pct}%</span>
        </div>
        <div class="chart-track">
          <div class="chart-fill ${isAns ? 'is-answer' : ''}"
               style="width: ${pct}%"
               data-pct="${pct}">
          </div>
        </div>
      `;
      container.appendChild(row);
    });
  }
};

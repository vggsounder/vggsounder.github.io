// Three interactive Chart.js charts for the modality-confusion results section:
//   (a) per-model μ(A) vs μ(V), split into Embedding vs Foundation families
//   (b) per-model ΔF1 voice-over bias (diverging bars)
//   (c) per-model ΔF1 static-image bias (diverging bars)
document.addEventListener('DOMContentLoaded', function () {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded');
    return;
  }

  Chart.defaults.font.family = "'Noto Sans', sans-serif";
  const BLUE = '#3273dc';
  const ORANGE = '#fd7e14';
  const GREEN = '#2bae66';
  const RED = '#e0566b';

  // Scroll reveal: bars grow when the chart enters the viewport and reset once
  // it is fully out of view, so the animation replays on every pass. The axis
  // ranges are pinned via suggestedMin/Max at creation, so only the bars move.
  function animateOnScroll(chart, canvas) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const targets = chart.data.datasets.map((d) => d.data.slice());
    const hide = () => {
      chart.data.datasets.forEach((d) => { d.data = d.data.map(() => 0); });
      chart.update('none'); // instant — happens off-screen
    };
    hide();
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.3) {
          chart.data.datasets.forEach((d, i) => { d.data = targets[i].slice(); });
          chart.update();
        } else if (!e.isIntersecting) {
          hide();
        }
      });
    }, { threshold: [0, 0.35] }).observe(canvas);
  }

  // ---- Chart (a): modality confusion μ(A) vs μ(V) -------------------------
  const muCanvas = document.getElementById('mu-chart');
  if (muCanvas) {
    fetch('./static/data/modality-confusion.json')
      .then((r) => r.json())
      .then((data) => {
        const models = data.models || [];
        const labels = models.map((m) => m.model);
        const setCaption = document.getElementById('mu-caption');
        if (setCaption && data.caption) setCaption.textContent = data.caption;

        // index of the first model whose family differs from the previous one
        let boundary = -1;
        for (let i = 1; i < models.length; i++) {
          if (models[i].family !== models[i - 1].family) { boundary = i; break; }
        }

        // soft shaded bands behind each model family, with a label per band
        const familyBands = {
          id: 'familyBands',
          beforeDatasetsDraw(chart) {
            if (boundary < 0) return;
            const x = chart.scales.x;
            const { top, bottom, left, right } = chart.chartArea;
            const mid = (x.getPixelForValue(boundary - 1) + x.getPixelForValue(boundary)) / 2;
            const ctx = chart.ctx;
            ctx.save();
            // band 1 (left family) and band 2 (right family)
            ctx.fillStyle = 'rgba(50, 115, 220, 0.06)';
            ctx.fillRect(left, top, mid - left, bottom - top);
            ctx.fillStyle = 'rgba(43, 174, 102, 0.07)';
            ctx.fillRect(mid, top, right - mid, bottom - top);
            // labels centered over each band
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.font = '700 11px ' + Chart.defaults.font.family;
            ctx.textBaseline = 'top';
            ctx.textAlign = 'center';
            ctx.fillText((models[0].family || '').toUpperCase(), (left + mid) / 2, top + 4);
            ctx.fillText((models[boundary].family || '').toUpperCase(), (mid + right) / 2, top + 4);
            ctx.restore();
          }
        };

        // ---- modality-balance badges (top-right toggle) ----
        // High μ(A) means the model forgets audible answers once video is added,
        // i.e. it leans on video — and vice versa.
        const BALANCE_RATIO = 2;
        const balanceOf = (m) => {
          if (m.muA >= m.muV * BALANCE_RATIO) return 'video centric';
          if (m.muV >= m.muA * BALANCE_RATIO) return 'audio centric';
          return 'balanced';
        };
        let showBadges = false;

        function pill(ctx, x, y, w, h, r) {
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        const balanceBadges = {
          id: 'balanceBadges',
          afterDatasetsDraw(chart) {
            if (!showBadges) return;
            const x = chart.scales.x;
            const { top, left, right } = chart.chartArea;
            const ctx = chart.ctx;
            const groupW = models.length > 1
              ? Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0))
              : right - left;
            const padX = 5, padY = 3, lineH = 10;
            models.forEach((m, i) => {
              const label = balanceOf(m);
              const cx = x.getPixelForValue(i);
              const balanced = label === 'balanced';
              // solid backgrounds: badges must stay readable over tall bars
              const bg = balanced ? '#def3e7' : '#fbe4e8';
              const ink = balanced ? '#17693f' : '#a12e41';
              const y0 = top + 18; // just below the family-band labels
              ctx.save();
              ctx.font = '700 9px ' + Chart.defaults.font.family;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const lines = balanced ? [label] : label.split(' ');
              const pillW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
              const pillH = lines.length * lineH + padY * 2;
              if (pillW <= groupW - 2) {
                // horizontal pill centred over the bar group
                ctx.fillStyle = bg;
                pill(ctx, cx - pillW / 2, y0, pillW, pillH, 4);
                ctx.fillStyle = ink;
                lines.forEach((l, j) => ctx.fillText(l, cx, y0 + padY + lineH * (j + 0.5)));
              } else {
                // narrow layout: hang the badge vertically below the top edge
                const len = ctx.measureText(label).width + padX * 2;
                ctx.translate(cx, y0);
                ctx.rotate(Math.PI / 2);
                ctx.fillStyle = bg;
                pill(ctx, 0, -(lineH / 2 + padY), len, lineH + padY * 2, 4);
                ctx.fillStyle = ink;
                ctx.fillText(label, len / 2, 1);
              }
              ctx.restore();
            });
          }
        };

        const muChart = new Chart(muCanvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'μ(A)  forgets audible', data: models.map((m) => m.muA), backgroundColor: BLUE },
              { label: 'μ(V)  forgets visible', data: models.map((m) => m.muV), backgroundColor: ORANGE }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                suggestedMax: Math.max(...models.map((m) => Math.max(m.muA, m.muV))),
                title: { display: true, text: 'μ  (lower is better)' }
              },
              x: { ticks: { maxRotation: 45, minRotation: 45 } }
            },
            plugins: {
              legend: { position: 'top' },
              tooltip: {
                callbacks: {
                  afterTitle: (items) => {
                    const m = models[items[0].dataIndex];
                    const out = ['Family: ' + (m.family || '')];
                    if (showBadges) out.push('Balance: ' + balanceOf(m));
                    return out;
                  }
                }
              }
            }
          },
          plugins: [familyBands, balanceBadges]
        });

        const badgeToggle = document.getElementById('mu-badge-toggle');
        if (badgeToggle) {
          badgeToggle.addEventListener('change', () => {
            showBadges = badgeToggle.checked;
            // extra headroom so the badge row clears the tallest bars
            muChart.options.scales.y.grace = showBadges ? '30%' : undefined;
            muChart.update();
          });
        }

        animateOnScroll(muChart, muCanvas);
      })
      .catch((err) => console.error('μ chart failed:', err));
  }

  // ---- Charts (b) & (c): ΔF1 confounder-bias bars -------------------------
  // Same shape for both: diverging value bars (green = better without the
  // confounder, red = worse), value labels, y-axis title from the data file.
  function deltaChart(canvasId, captionId, url) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const models = data.models || [];
        const setCaption = document.getElementById(captionId);
        if (setCaption && data.caption) setCaption.textContent = data.caption;

        const valueLabels = {
          id: 'valueLabels',
          afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(0);
            ctx.save();
            ctx.font = '600 11px ' + Chart.defaults.font.family;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.textAlign = 'center';
            meta.data.forEach((bar, i) => {
              const v = chart.data.datasets[0].data[i];
              if (!v) return; // hidden state before the scroll reveal
              ctx.textBaseline = v >= 0 ? 'bottom' : 'top';
              ctx.fillText(v.toFixed(2), bar.x, bar.y + (v >= 0 ? -4 : 4));
            });
            ctx.restore();
          }
        };

        const deltas = models.map((m) => m.delta);
        const chart = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: models.map((m) => m.model),
            datasets: [{
              label: data.metric || 'ΔF1',
              data: deltas,
              backgroundColor: models.map((m) => (m.delta >= 0 ? GREEN : RED))
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                suggestedMin: Math.min(0, ...deltas),
                suggestedMax: Math.max(0, ...deltas),
                title: { display: true, text: data.metric || 'ΔF1' },
                grid: { color: (c) => (c.tick.value === 0 ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.1)') }
              },
              x: { ticks: { maxRotation: 45, minRotation: 45 } }
            },
            plugins: {
              legend: { display: false }
            }
          },
          plugins: [valueLabels]
        });

        animateOnScroll(chart, canvas);
      })
      .catch((err) => console.error(canvasId + ' failed:', err));
  }

  deltaChart('vo-chart', 'vo-caption', './static/data/voiceover-bias.json');
  deltaChart('si-chart', 'si-caption', './static/data/static-image-bias.json');
});

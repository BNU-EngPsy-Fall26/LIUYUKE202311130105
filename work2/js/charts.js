/* ============================================================
   charts.js — 纯手写 SVG 图表（无第三方库，离线可用）
   ============================================================ */

(function () {
  const AL = window.AL;
  const U = AL.util;
  const NS = 'http://www.w3.org/2000/svg';

  function s(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(k => node.setAttribute(k, attrs[k]));
    return node;
  }

  function text(x, y, str, opts) {
    const o = opts || {};
    const t = s('text', {
      x, y,
      fill: o.fill || '#8ba0ae',
      'font-size': o.size || 11,
      'font-family': o.mono ? 'Consolas, monospace' : 'inherit',
      'text-anchor': o.anchor || 'middle',
      'font-weight': o.weight || 400,
      'dominant-baseline': o.baseline || 'auto'
    });
    t.textContent = str;
    return t;
  }

  function frame(width, height, m) {
    const svg = s('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width: '100%',
      role: 'img',
      style: `max-width:${width}px`
    });
    const plot = {
      x: m.l,
      y: m.t,
      w: width - m.l - m.r,
      h: height - m.t - m.b
    };
    return { svg, plot };
  }

  function legend(series) {
    const box = document.createElement('div');
    box.className = 'legend';
    series.forEach(se => {
      const item = document.createElement('span');
      // 图例画一小段线样本：实线/虚线与图中一致，中间带数据点标记
      const dash = se.dashed ? 'stroke-dasharray="5 4"' : '';
      item.innerHTML = `<svg width="30" height="10" style="vertical-align:middle;margin-right:6px" aria-hidden="true">` +
        `<line x1="2" y1="5" x2="28" y2="5" stroke="${se.color}" stroke-width="2.6" stroke-linecap="round" ${dash}/>` +
        `<circle cx="15" cy="5" r="3" fill="#fff" stroke="${se.color}" stroke-width="2"/></svg>${se.name}`;
      box.appendChild(item);
    });
    return box;
  }

  AL.chart = {
    /**
     * 折线图
     * @param {HTMLElement} host
     * @param {Object} cfg {xLabels, series:[{name,color,values}], yMin, yMax, yLabel, suffix, valueFmt}
     */
    line(host, cfg) {
      host.innerHTML = '';
      const width = 760, height = 360;
      const m = { l: 62, r: 26, t: 26, b: 62 };
      const { svg, plot } = frame(width, height, m);
      const yMin = cfg.yMin !== undefined ? cfg.yMin : 0;
      const yMax = cfg.yMax !== undefined ? cfg.yMax : 100;
      const n = cfg.xLabels.length;
      const xAt = i => plot.x + (n === 1 ? plot.w / 2 : (plot.w * i) / (n - 1));
      const yAt = v => plot.y + plot.h - ((v - yMin) / (yMax - yMin)) * plot.h;

      // 横向网格与 y 轴刻度
      const steps = 5;
      for (let i = 0; i <= steps; i++) {
        const v = yMin + ((yMax - yMin) * i) / steps;
        const y = yAt(v);
        svg.appendChild(s('line', {
          x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y,
          stroke: '#e3ebf3', 'stroke-width': 1
        }));
        svg.appendChild(text(plot.x - 10, y + 4, (cfg.valueFmt || (x => x)) (v), { anchor: 'end', mono: true }));
      }

      // 坐标轴
      svg.appendChild(s('line', {
        x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.h,
        stroke: '#c9d8e6', 'stroke-width': 1
      }));
      svg.appendChild(s('line', {
        x1: plot.x, y1: plot.y + plot.h, x2: plot.x + plot.w, y2: plot.y + plot.h,
        stroke: '#c9d8e6', 'stroke-width': 1
      }));

      // x 轴标签
      cfg.xLabels.forEach((lb, i) => {
        svg.appendChild(text(xAt(i), plot.y + plot.h + 24, lb, { size: 12, fill: '#4f687b' }));
      });
      if (cfg.xLabel) {
        svg.appendChild(text(plot.x + plot.w / 2, height - 12, cfg.xLabel, { size: 11, fill: '#6b8296' }));
      }
      if (cfg.yLabel) {
        const t = text(0, 0, cfg.yLabel, { size: 11, fill: '#6b8296' });
        t.setAttribute('transform', `translate(16 ${plot.y + plot.h / 2}) rotate(-90)`);
        svg.appendChild(t);
      }

      // 数据线
      const tip = document.createElement('div');
      tip.style.cssText = 'position:absolute;display:none;pointer-events:none;background:#fff;border:1px solid #d7e3ee;' +
        'border-radius:8px;padding:6px 10px;font-size:12px;line-height:1.5;box-shadow:0 4px 14px rgba(31,45,58,.14);' +
        'transform:translate(-50%,-118%);white-space:nowrap;z-index:5;color:#2c3e50';
      host.style.position = 'relative';

      cfg.series.forEach(se => {
        let d = '';
        const pts = [];
        se.values.forEach((v, i) => {
          if (!Number.isFinite(v)) return;
          const x = xAt(i), y = yAt(U.clamp(v, yMin, yMax));
          pts.push({ x, y, v, i });
          d += (d === '' ? 'M' : 'L') + x + ' ' + y + ' ';
        });
        if (pts.length > 1) {
          const line = s('path', {
            d, fill: 'none', stroke: se.color, 'stroke-width': 2.4,
            'stroke-linejoin': 'round', 'stroke-linecap': 'round'
          });
          if (se.dashed) line.setAttribute('stroke-dasharray', '6 4');
          svg.appendChild(line);
        }
        pts.forEach(p => {
          svg.appendChild(s('circle', { cx: p.x, cy: p.y, r: se.dashed ? 3 : 4.2, fill: '#ffffff', stroke: se.color, 'stroke-width': 2.4 }));
          svg.appendChild(text(p.x, p.y - 12, (cfg.valueFmt || (x => x))(p.v), {
            size: 10.5, fill: se.color, mono: true, weight: 600
          }));
          // 悬停热区：透明大圆点，移入显示数值气泡
          const hot = s('circle', { cx: p.x, cy: p.y, r: 16, fill: 'transparent', style: 'cursor:default' });
          hot.addEventListener('mouseenter', () => {
            const scale = svg.getBoundingClientRect().width / width;
            tip.innerHTML = `<b>${se.name}</b><br>${cfg.xLabels[p.i]}：${(cfg.valueFmt || (x => x))(p.v)}`;
            tip.style.left = (p.x * scale) + 'px';
            tip.style.top = (p.y * scale) + 'px';
            tip.style.display = 'block';
          });
          hot.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
          svg.appendChild(hot);
        });
      });

      host.appendChild(svg);
      host.appendChild(tip);
      if (cfg.series.length > 1) host.appendChild(legend(cfg.series));
    },

    /**
     * 分组柱状图
     * @param {Object} cfg {groups:[{label, values:[...]}], series:[{name,color}], yLabel, yMax, valueFmt}
     */
    bars(host, cfg) {
      host.innerHTML = '';
      const width = 760, height = 360;
      const m = { l: 66, r: 26, t: 26, b: 62 };
      const { svg, plot } = frame(width, height, m);
      const yMax = cfg.yMax !== undefined ? cfg.yMax : 100;
      const groups = cfg.groups;
      const series = cfg.series;
      const gw = plot.w / groups.length;
      const pad = gw * 0.22;
      const innerW = gw - pad * 2;
      const bw = innerW / series.length;
      const fmt = cfg.valueFmt || (x => x);

      const steps = 5;
      for (let i = 0; i <= steps; i++) {
        const v = (yMax * i) / steps;
        const y = plot.y + plot.h - (v / yMax) * plot.h;
        svg.appendChild(s('line', {
          x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y,
          stroke: '#e3ebf3', 'stroke-width': 1
        }));
        svg.appendChild(text(plot.x - 10, y + 4, fmt(v), { anchor: 'end', mono: true }));
      }

      svg.appendChild(s('line', {
        x1: plot.x, y1: plot.y + plot.h, x2: plot.x + plot.w, y2: plot.y + plot.h,
        stroke: '#c9d8e6', 'stroke-width': 1
      }));

      groups.forEach((g, gi) => {
        const gx = plot.x + gi * gw;
        svg.appendChild(text(gx + gw / 2, plot.y + plot.h + 24, g.label, { size: 12, fill: '#4f687b' }));

        g.values.forEach((v, si) => {
          const val = Number.isFinite(v) ? U.clamp(v, 0, yMax) : 0;
          const h = (val / yMax) * plot.h;
          const x = gx + pad + si * bw + bw * 0.1;
          const w = bw * 0.8;
          svg.appendChild(s('rect', {
            x, y: plot.y + plot.h - h, width: w, height: Math.max(h, 0),
            fill: series[si].color, rx: 3, opacity: 0.92
          }));
          if (Number.isFinite(v)) {
            svg.appendChild(text(x + w / 2, plot.y + plot.h - h - 8, fmt(v), {
              size: 10.5, fill: series[si].color, mono: true, weight: 600
            }));
          }
        });
      });

      if (cfg.yLabel) {
        const t = text(0, 0, cfg.yLabel, { size: 11, fill: '#6b8296' });
        t.setAttribute('transform', `translate(18 ${plot.y + plot.h / 2}) rotate(-90)`);
        svg.appendChild(t);
      }

      host.appendChild(svg);
      if (series.length > 1) host.appendChild(legend(series));
    }
  };
})();

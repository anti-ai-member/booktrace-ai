import { useCallback, useMemo, useRef } from "react";
import { Application, extend, useApplication } from "@pixi/react";
import { Container, Graphics } from "pixi.js";
import { Check } from "lucide-react";

extend({ Container, Graphics });

const DOMAIN_PALETTES = {
  military: { accent: 0xd7bd77, open: 0xf8e4a8, available: 0xa8d1bd, dim: 0x6f8580, fogA: "rgba(49, 101, 86, .28)", fogB: "rgba(91, 74, 50, .28)" },
  history: { accent: 0xd6c08a, open: 0xffedb3, available: 0xb7d2be, dim: 0x78908b, fogA: "rgba(55, 93, 72, .25)", fogB: "rgba(125, 99, 58, .22)" },
  science: { accent: 0x9fd5d5, open: 0xdff8f7, available: 0xb7d6ca, dim: 0x698c93, fogA: "rgba(52, 123, 133, .28)", fogB: "rgba(61, 99, 84, .20)" },
  technology: { accent: 0xa9c6e8, open: 0xe4f0ff, available: 0xb6d2dc, dim: 0x697d9b, fogA: "rgba(52, 88, 130, .25)", fogB: "rgba(54, 118, 116, .18)" },
  fiction: { accent: 0xe2b1bd, open: 0xffe4ec, available: 0xc9d4b7, dim: 0x8d7684, fogA: "rgba(122, 69, 89, .24)", fogB: "rgba(69, 103, 82, .18)" },
  business: { accent: 0xd7c386, open: 0xffefb8, available: 0xc3d2ad, dim: 0x8f8567, fogA: "rgba(117, 99, 54, .24)", fogB: "rgba(50, 92, 84, .18)" },
  default: { accent: 0xd7bd77, open: 0xffedb3, available: 0xb7d2be, dim: 0x78908b, fogA: "rgba(55, 93, 72, .25)", fogB: "rgba(125, 99, 58, .20)" },
};

const STAR_LAYOUTS = {
  military: [
    { x: 0.18, y: 0.63 },
    { x: 0.38, y: 0.32 },
    { x: 0.59, y: 0.59 },
    { x: 0.81, y: 0.28 },
  ],
  history: [
    { x: 0.17, y: 0.48 },
    { x: 0.39, y: 0.26 },
    { x: 0.61, y: 0.46 },
    { x: 0.82, y: 0.23 },
  ],
  science: [
    { x: 0.2, y: 0.32 },
    { x: 0.42, y: 0.57 },
    { x: 0.62, y: 0.31 },
    { x: 0.82, y: 0.54 },
  ],
  fiction: [
    { x: 0.2, y: 0.57 },
    { x: 0.39, y: 0.25 },
    { x: 0.6, y: 0.42 },
    { x: 0.82, y: 0.2 },
  ],
  default: [
    { x: 0.18, y: 0.6 },
    { x: 0.39, y: 0.31 },
    { x: 0.61, y: 0.56 },
    { x: 0.82, y: 0.28 },
  ],
};

function seededStars(seed) {
  let value = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 97);
  return Array.from({ length: 78 }, (_, index) => {
    value = (value * 9301 + 49297) % 233280;
    const x = value / 233280;
    value = (value * 9301 + 49297) % 233280;
    const y = value / 233280;
    value = (value * 9301 + 49297) % 233280;
    return { x, y, r: 0.55 + (value / 233280) * 1.25, a: 0.18 + ((index % 7) * 0.055) };
  });
}

function point(layoutPoint, width, height) {
  return { x: layoutPoint.x * width, y: layoutPoint.y * height };
}

function drawSoftCircle(graphics, x, y, radius, color, alpha) {
  graphics.setFillStyle({ color, alpha });
  graphics.circle(x, y, radius);
  graphics.fill();
}

function ConstellationLayer({ nodes, links, palette, selectedIndex, domain }) {
  const { app } = useApplication();
  const backgroundStars = useMemo(() => seededStars(domain), [domain]);

  const draw = useCallback((graphics) => {
    const width = Math.max(1, app.screen.width);
    const height = Math.max(1, app.screen.height);
    const time = performance.now() / 1000;
    graphics.clear();

    graphics.setFillStyle({ color: 0x061821, alpha: 0.96 });
    graphics.roundRect(0, 0, width, height, 0);
    graphics.fill();

    drawSoftCircle(graphics, width * 0.23, height * 0.64, height * 0.42, 0x1f6a59, 0.18);
    drawSoftCircle(graphics, width * 0.74, height * 0.26, height * 0.34, 0x225d75, 0.2);
    drawSoftCircle(graphics, width * 0.5, height * 0.52, height * 0.5, 0x0f3444, 0.2);

    backgroundStars.forEach((star, index) => {
      const flicker = 0.75 + Math.sin(time * 0.8 + index) * 0.25;
      graphics.setFillStyle({ color: 0xd7efec, alpha: star.a * flicker });
      graphics.circle(star.x * width, star.y * height, star.r);
      graphics.fill();
    });

    links.forEach(([from, to]) => {
      const start = point(nodes[from], width, height);
      const end = point(nodes[to], width, height);
      const active = nodes[from].unlocked && (nodes[to].unlocked || nodes[to].available);
      const alpha = active ? 0.8 : 0.28;
      graphics.setStrokeStyle({ width: 7, color: active ? palette.open : palette.dim, alpha: alpha * 0.08 });
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      graphics.stroke();
      graphics.setStrokeStyle({ width: active ? 2.2 : 1.3, color: active ? palette.open : palette.dim, alpha });
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      graphics.stroke();
    });

    nodes.forEach((node, index) => {
      const current = point(node, width, height);
      const selected = selectedIndex === index;
      const available = node.available && !node.unlocked;
      const base = node.unlocked ? palette.open : available ? palette.available : palette.dim;
      const pulse = selected || available ? 1 + Math.sin(time * 2.2 + index) * 0.08 : 1;
      const radius = (node.root ? 19 : 15) * pulse;

      drawSoftCircle(graphics, current.x, current.y, radius * 3.1, base, selected ? 0.18 : node.unlocked ? 0.11 : 0.055);
      drawSoftCircle(graphics, current.x, current.y, radius * 1.8, base, selected ? 0.13 : 0.07);
      graphics.setStrokeStyle({ width: selected ? 2.4 : 1.6, color: base, alpha: selected ? 0.95 : 0.78 });
      graphics.circle(current.x, current.y, radius);
      graphics.stroke();
      graphics.setFillStyle({ color: node.unlocked ? 0xfff7d1 : available ? 0xdff2df : 0x9aaba5, alpha: node.unlocked ? 1 : 0.84 });
      graphics.circle(current.x, current.y, node.root ? 5.5 : 4.4);
      graphics.fill();
    });
  }, [app, backgroundStars, domain, links, nodes, palette, selectedIndex]);

  return <pixiGraphics draw={draw} />;
}

export function TalentConstellation({ skills, domain, xp, selectedIndex, onSelect }) {
  const stageRef = useRef(null);
  const palette = DOMAIN_PALETTES[domain] || DOMAIN_PALETTES.default;
  const layout = STAR_LAYOUTS[domain] || STAR_LAYOUTS.default;
  const nodes = useMemo(() => {
    const nextRequirement = skills.find(([, , requirement]) => xp < requirement)?.[2] ?? Infinity;
    return [
      { x: 0.5, y: 0.75, root: true, unlocked: true, available: false },
      ...skills.map(([name, detail, requirement], index) => ({
        ...(layout[index] || layout[layout.length - 1]),
        name,
        detail,
        requirement,
        unlocked: xp >= requirement,
        available: requirement === nextRequirement,
      })),
    ];
  }, [layout, skills, xp]);
  const links = useMemo(() => {
    const result = [[0, 1]];
    for (let index = 1; index < nodes.length - 1; index += 1) result.push([index, index + 1]);
    return result;
  }, [nodes.length]);

  return (
    <div
      className="talent-scene"
      ref={stageRef}
      style={{ "--scene-fog-a": palette.fogA, "--scene-fog-b": palette.fogB }}
    >
      <Application className="talent-canvas" resizeTo={stageRef} backgroundAlpha={0} antialias autoDensity>
        <ConstellationLayer nodes={nodes} links={links} palette={palette} selectedIndex={selectedIndex + 1} domain={domain} />
      </Application>
      <div className="talent-hit-layer" aria-label="专属天赋星宿图">
        {skills.map(([name, detail, requirement], index) => {
          const layoutPoint = nodes[index + 1];
          const unlocked = xp >= requirement;
          const available = layoutPoint.available;
          return (
            <button
              className={`talent-hit${selectedIndex === index ? " selected" : ""}${unlocked ? " unlocked" : ""}${available ? " available" : ""}`}
              key={name}
              type="button"
              style={{ left: `${layoutPoint.x * 100}%`, top: `${layoutPoint.y * 100}%` }}
              data-label-side={layoutPoint.x > 0.62 ? "left" : "right"}
              onClick={() => onSelect(index)}
              aria-label={`${name}，${unlocked ? "已解锁" : `需要 ${requirement} 类型经验`}`}
            >
              <span>{unlocked ? <Check size={15} /> : index + 1}</span>
              <em>
                <b>{name}</b>
                <small>{detail}</small>
              </em>
            </button>
          );
        })}
      </div>
      <div className="talent-scene-caption">
        <span>拖曳感星图</span>
        <strong>{skills.filter(([, , requirement]) => xp >= requirement).length} / {skills.length}</strong>
      </div>
    </div>
  );
}

import ForceGraph3D, {
  type ForceGraph3DInstance,
  type NodeObject,
  type LinkObject,
} from "3d-force-graph";
import SpriteText from "three-spritetext";
import {
  Group,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  AdditiveBlending,
} from "three";
import {
  networkKinds,
  networkLayout3D,
  type Network,
  type NetworkNode,
  type NetworkPoint3D,
} from "./gortex-network";

export type SceneLabels = "auto" | "all" | "none";
type SceneNode = NodeObject & NetworkNode & { anchor: NetworkPoint3D };
type SceneLink = LinkObject<SceneNode> & {
  from: string;
  to: string;
  label: string;
};
export interface GortexScene {
  update(
    network: Network,
    selected: string,
    labels: SceneLabels,
    motion: boolean,
  ): void;
  fit(): void;
  zoom(factor: number): void;
  dispose(): void;
}

export function createGortexScene(
  host: HTMLDivElement,
  onSelect: (id: string) => void,
): GortexScene {
  // The upstream constructor declares default node/link types; application data
  // is adapted only at this boundary. Never pass model text as tooltip HTML.
  const graph = new ForceGraph3D(host, {
    controlType: "trackball",
    rendererConfig: { antialias: true, alpha: false },
  }) as unknown as ForceGraph3DInstance<SceneNode, SceneLink>;
  const sprites = new Map<string, SpriteText>();
  const halos = new Map<string, Sprite>();
  const haloTexture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(32, 32, 3, 32, 32, 32);
    // White is an alpha mask; the material receives the semantic category color.
    gradient.addColorStop(0, "rgba(255,255,255,0.7)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.25)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return new CanvasTexture(canvas);
  };
  let data: { nodes: SceneNode[]; links: SceneLink[] } = {
    nodes: [],
    links: [],
  };
  let lastStyle = "";
  let topology = "",
    selection = "",
    labels: SceneLabels = "auto",
    motion = true;
  let colors: Record<string, string> = {};
  let disposed = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const tooltip = (text: string) => {
    const element = document.createElement("span");
    element.textContent = text;
    return element;
  };
  const resolveColor = (value: string) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    host.appendChild(probe);
    const css = getComputedStyle(probe).color;
    probe.remove();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return `rgb(${r},${g},${b})`;
  };
  const emphasized = (link: SceneLink) =>
    link.from === selection || link.to === selection;
  const updateSprites = () => {
    for (const node of data.nodes) {
      const sprite = sprites.get(node.id);
      if (!sprite) continue;
      const text =
        node.label.length > 23 ? node.label.slice(0, 21) + "…" : node.label;
      if (sprite.text !== text) sprite.text = text;
      if (sprite.color !== colors.foreground) sprite.color = colors.foreground;
      const labelBackground = node.id === selection ? colors.background : false;
      if (sprite.backgroundColor !== labelBackground)
        sprite.backgroundColor = labelBackground;
      const halo = halos.get(node.id);
      if (halo) {
        halo.material.color.set(colors[node.kind]);
        halo.material.opacity =
          node.id === selection
            ? 0.85
            : node.running
              ? 0.55
              : node.kind === "session"
                ? 0.3
                : 0.12;
      }
      sprite.visible =
        labels === "all" ||
        node.id === selection ||
        (labels === "auto" &&
          (node.kind === "session" ||
            node.kind === "workspace" ||
            !!node.running));
    }
  };
  const applyStyle = () => {
    graph
      .nodeColor((node: SceneNode) => colors[node.kind])
      .nodeVal((node: SceneNode) =>
        node.kind === "session" ? 20 : node.kind === "tool" ? 0.7 : 3,
      )
      .linkColor((link: SceneLink) =>
        emphasized(link) ? colors.active : colors.quiet,
      )
      .linkWidth((link: SceneLink) => (emphasized(link) ? 1.2 : 0.35))
      .linkDirectionalParticles((link: SceneLink) =>
        motion && !reduced.matches && emphasized(link) ? 5 : 0,
      )
      .linkDirectionalParticleColor(() => colors.active);
    updateSprites();
  };
  const refreshTheme = () => {
    colors = Object.fromEntries(
      networkKinds.map((kind) => [kind.id, resolveColor(kind.color)]),
    );
    colors.background = resolveColor("var(--background)");
    colors.foreground = resolveColor("var(--foreground)");
    colors.active = resolveColor("var(--gortex-node-session)");
    colors.quiet = resolveColor("var(--gortex-edge-quiet)");
    graph.backgroundColor(colors.background);
    applyStyle();
  };
  graph
    .showNavInfo(false)
    .nodeResolution(24)
    .nodeOpacity(0.95)
    .linkOpacity(0.85)
    .linkCurvature(0)
    .linkDirectionalParticleWidth(2.2)
    .linkDirectionalParticleSpeed(0.004)
    .nodeLabel((node: SceneNode) => tooltip(`${node.label} · ${node.state}`))
    .linkLabel((link: SceneLink) => tooltip(link.label))
    .nodeThreeObjectExtend(true)
    .nodeThreeObject((node: SceneNode) => {
      let sprite = sprites.get(node.id);
      if (!sprite) {
        sprite = new SpriteText(
          node.label,
          node.kind === "session" ? 11 : 8,
          colors.foreground,
        );
        sprite.padding = 2;
        sprite.borderRadius = 2;
        sprite.position.y = node.kind === "session" ? -20 : -14;
        sprite.material.depthWrite = false;
        sprites.set(node.id, sprite);
      }
      const group = new Group();
      const halo = new Sprite(
        new SpriteMaterial({
          map: haloTexture(),
          color: colors[node.kind],
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      const size = node.kind === "session" ? 65 : 28;
      halo.scale.set(size, size, 1);
      halos.set(node.id, halo);
      group.add(halo, sprite);
      updateSprites();
      return group;
    })
    .onNodeClick((node: SceneNode) => onSelect(node.id))
    .onBackgroundClick(() => onSelect(""))
    .onNodeDragEnd((node: SceneNode) => {
      const limit = node.kind === "session" ? 120 : 450;
      for (const axis of ["x", "y", "z"] as const)
        node[axis] = Math.max(-limit, Math.min(limit, node[axis] ?? 0));
      node.fx = node.x;
      node.fy = node.y;
      node.fz = node.z;
    })
    .onNodeHover((node: SceneNode | null) => {
      host.style.cursor = node ? "pointer" : "grab";
    })
    .warmupTicks(0)
    .cooldownTicks(reduced.matches ? 0 : 100);
  // Sessions are anchored centrally; outer nodes settle around semantic targets.
  graph.d3Force("center", null);
  graph.d3Force("charge")?.strength(-35);
  graph.d3Force("link")?.distance(90).strength(0.08);
  graph.d3Force("semantic-anchor", (alpha: number) => {
    for (const node of data.nodes) {
      if (node.kind === "session") continue;
      for (const axis of ["x", "y", "z"] as const) {
        const velocity = `v${axis}` as "vx" | "vy" | "vz";
        node[velocity] =
          (node[velocity] ?? 0) +
          (node.anchor[axis] - (node[axis] ?? 0)) * alpha * 0.08;
      }
    }
  });
  graph.renderer().setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const canvas = graph.renderer().domElement;
  canvas.setAttribute(
    "aria-label",
    "Graph Gortex 3D: kéo để xoay, cuộn để zoom",
  );
  canvas.setAttribute("role", "img");
  const resize = new ResizeObserver(() => {
    if (!disposed) graph.width(host.clientWidth).height(host.clientHeight);
  });
  resize.observe(host);
  graph.width(host.clientWidth).height(host.clientHeight);
  const resetCamera = () => {
    const distance = host.clientWidth < 500 ? 1000 : 680;
    graph.cameraPosition(
      { x: distance * 0.12, y: distance * 0.16, z: distance },
      { x: 0, y: 0, z: 0 },
      0,
    );
  };
  resetCamera();
  const theme = new MutationObserver(refreshTheme);
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  const onReduced = () => {
    graph.cooldownTicks(reduced.matches ? 0 : 100);
    applyStyle();
  };
  reduced.addEventListener("change", onReduced);
  const visibility = () => {
    if (document.hidden) graph.pauseAnimation();
    else graph.resumeAnimation();
  };
  document.addEventListener("visibilitychange", visibility);
  refreshTheme();
  return {
    update(network, selected, nextLabels, nextMotion) {
      if (disposed) return;
      selection = selected;
      labels = nextLabels;
      motion = nextMotion;
      const old = new Map(data.nodes.map((node) => [node.id, node]));
      const anchors = networkLayout3D(network);
      const retained = new Set(network.nodes.map((node) => node.id));
      const occupied = data.nodes
        .filter((node) => node.kind === "session" && retained.has(node.id))
        .map((node) => ({ x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 }));
      const candidates = network.nodes
        .filter((node) => node.kind === "session")
        .map((node) => anchors[node.id]);
      const clearance = (point: NetworkPoint3D) =>
        Math.min(
          ...occupied.map((other) =>
            Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z),
          ),
        );
      const nodes = network.nodes.map((node) => {
        const existing = old.get(node.id);
        if (existing) {
          Object.assign(existing, node);
          return existing;
        }
        let anchor = anchors[node.id];
        if (node.kind === "session") {
          if (occupied.length && clearance(anchor) < 45)
            anchor =
              [...candidates].sort((a, b) => clearance(b) - clearance(a))[0] ??
              anchor;
          occupied.push(anchor);
        }
        return {
          ...node,
          ...anchor,
          anchor,
          ...(node.kind === "session"
            ? { fx: anchor.x, fy: anchor.y, fz: anchor.z }
            : {}),
        };
      });
      const key = JSON.stringify([
        network.nodes.map((n) => n.id).sort(),
        network.edges.map((e) => [e.from, e.to]).sort(),
      ]);
      if (key !== topology) {
        const allowed = new Set(nodes.map((node) => node.id));
        for (const [id, sprite] of sprites)
          if (!allowed.has(id)) {
            sprite.material.map?.dispose();
            sprite.material.dispose();
            sprites.delete(id);
            halos.delete(id);
          }
        data = {
          nodes,
          links: network.edges.map((edge) => ({
            ...edge,
            source: edge.from,
            target: edge.to,
          })),
        };
        topology = key;
        graph.graphData(data);
      }
      const nextStyle = JSON.stringify([
        selection,
        labels,
        motion,
        network.nodes.map((node) => [node.id, node.label, node.running]),
      ]);
      if (nextStyle !== lastStyle) {
        lastStyle = nextStyle;
        applyStyle();
      }
    },
    fit() {
      const network = { nodes: data.nodes, edges: data.links };
      const anchors = networkLayout3D(network);
      for (const node of data.nodes) {
        node.anchor = anchors[node.id];
        Object.assign(node, node.anchor, { vx: 0, vy: 0, vz: 0 });
        node.fx = node.kind === "session" ? node.x : undefined;
        node.fy = node.kind === "session" ? node.y : undefined;
        node.fz = node.kind === "session" ? node.z : undefined;
      }
      graph.d3ReheatSimulation();
      resetCamera();
    },
    zoom(factor) {
      const position = graph.cameraPosition();
      graph.cameraPosition(
        {
          x: position.x * factor,
          y: position.y * factor,
          z: position.z * factor,
        },
        { x: 0, y: 0, z: 0 },
        0,
      );
    },
    dispose() {
      disposed = true;
      resize.disconnect();
      theme.disconnect();
      reduced.removeEventListener("change", onReduced);
      document.removeEventListener("visibilitychange", visibility);
      graph.pauseAnimation();
      graph._destructor();
      for (const sprite of sprites.values()) {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      }
      sprites.clear();
      halos.clear();
      graph.renderer().dispose();
      graph.renderer().forceContextLoss();
      host.replaceChildren();
    },
  };
}

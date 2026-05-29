import type { Logger } from '@/shared/logger';
import type { PluginManifest } from './PluginManifest';

export interface PluginMeta {
	name: string;
	description: PluginManifest;
	pluginPath: string;
}

type DependencyEdge = readonly [dependency: string, dependent: string];

export function resolvePluginLoadOrder(metas: PluginMeta[], logger: Logger): PluginMeta[] {
	const metaMap = new Map<string, PluginMeta>();
	for (const meta of metas) {
		metaMap.set(meta.name, meta);
	}

	const failed = new Set<string>();
	for (const meta of metas) {
		for (const dep of meta.description.depend ?? []) {
			if (!metaMap.has(dep)) {
				logger.error(
					`PluginManager: "${meta.name}" requires "${dep}" which is not available. Skipping.`,
				);
				failed.add(meta.name);
			}
		}
	}

	const hardEdges: DependencyEdge[] = [];
	for (const meta of metas) {
		if (failed.has(meta.name)) continue;

		for (const dep of meta.description.depend ?? []) {
			if (!metaMap.has(dep) || failed.has(dep)) continue;
			hardEdges.push([dep, meta.name]);
		}
	}

	const hardSorted = sortByDependencies(
		metas.filter((meta) => !failed.has(meta.name)),
		hardEdges,
	);

	if (hardSorted.cycleNames.length > 0) {
		logger.error(
			`PluginManager: Circular hard dependency detected among: ${hardSorted.cycleNames.join(', ')}. Skipping.`,
		);
	}

	const availableAfterHardSort = new Set(hardSorted.result.map((meta) => meta.name));
	const softEdges: DependencyEdge[] = [];
	for (const meta of hardSorted.result) {
		for (const dep of meta.description.softDepend ?? []) {
			if (!availableAfterHardSort.has(dep)) continue;
			softEdges.push([dep, meta.name]);
		}
	}

	if (softEdges.length === 0) return hardSorted.result;

	const softSorted = sortByDependencies(hardSorted.result, [...hardEdges, ...softEdges]);
	if (softSorted.cycleNames.length > 0) {
		logger.warn(
			`PluginManager: Soft dependency cycle detected among: ${softSorted.cycleNames.join(', ')}. Ignoring soft dependency order for those plugins.`,
		);
		return hardSorted.result;
	}

	return softSorted.result;
}

function sortByDependencies(
	metas: PluginMeta[],
	edges: DependencyEdge[],
): { result: PluginMeta[]; cycleNames: string[] } {
	const metaMap = new Map(metas.map((meta) => [meta.name, meta]));
	const inDegree = new Map<string, number>();
	const adjacency = new Map<string, string[]>();

	for (const meta of metas) {
		inDegree.set(meta.name, 0);
		adjacency.set(meta.name, []);
	}

	for (const [dependency, dependent] of edges) {
		if (!metaMap.has(dependency) || !metaMap.has(dependent)) continue;
		adjacency.get(dependency)!.push(dependent);
		inDegree.set(dependent, (inDegree.get(dependent) ?? 0) + 1);
	}

	const queue: string[] = [];
	for (const meta of metas) {
		if ((inDegree.get(meta.name) ?? 0) === 0) queue.push(meta.name);
	}

	const result: PluginMeta[] = [];
	while (queue.length > 0) {
		const name = queue.shift()!;
		const meta = metaMap.get(name);
		if (meta) result.push(meta);

		for (const neighbor of adjacency.get(name) ?? []) {
			const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
			inDegree.set(neighbor, newDegree);
			if (newDegree === 0) queue.push(neighbor);
		}
	}

	const loaded = new Set(result.map((meta) => meta.name));
	const cycleNames = metas.map((meta) => meta.name).filter((name) => !loaded.has(name));
	return { result, cycleNames };
}

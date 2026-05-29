import type { Logger } from '@/shared/logger';

export interface ServiceRegistrationOptions {
	readonly owner?: string;
	readonly replace?: boolean;
}

export interface ServiceUnregisterOptions {
	readonly owner?: string;
}

interface ServiceEntry {
	readonly service: unknown;
	readonly owner?: string;
}

export class ServiceRegistry {
	private readonly services = new Map<string, ServiceEntry>();

	public constructor(private readonly logger: Logger) {}

	public register<T>(
		name: string,
		service: T,
		options: ServiceRegistrationOptions = {},
	): boolean {
		const existing = this.services.get(name);
		if (existing && !options.replace) {
			this.logger.warn(`ServiceRegistry: "${name}" is already registered. Keeping existing.`);
			return false;
		}
		if (existing && options.replace) {
			this.logger.warn(`ServiceRegistry: "${name}" is already registered. Replacing.`);
		}
		this.services.set(name, { service, owner: options.owner });
		this.logger.debug(`ServiceRegistry: Registered "${name}"`);
		return true;
	}

	public get<T>(name: string): T | undefined {
		return this.services.get(name)?.service as T | undefined;
	}

	public unregister(name: string, options: ServiceUnregisterOptions = {}): boolean {
		const existing = this.services.get(name);
		if (!existing) return false;

		if (options.owner !== undefined && existing.owner !== options.owner) {
			this.logger.warn(
				`ServiceRegistry: "${name}" is owned by "${existing.owner ?? 'unknown'}"; "${options.owner}" cannot unregister it.`,
			);
			return false;
		}

		this.services.delete(name);
		this.logger.debug(`ServiceRegistry: Unregistered "${name}"`);
		return true;
	}

	public has(name: string): boolean {
		return this.services.has(name);
	}

	public getNames(): string[] {
		return Array.from(this.services.keys());
	}
}

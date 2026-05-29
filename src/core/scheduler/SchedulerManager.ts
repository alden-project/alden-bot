import { CronExpressionParser } from 'cron-parser';
import logger from '@/shared/logger';

export type CronCallback = () => void | Promise<void>;

interface ScheduledTask {
	pluginName: string;
	cronExp: string;
	callback: CronCallback;
	timer?: NodeJS.Timeout;
}

export class SchedulerManager {
	private readonly tasks = new Set<ScheduledTask>();
	private readonly runningTasks = new Set<ScheduledTask>();
	private started = false;

	public start(): void {
		if (this.started) return;
		this.started = true;

		for (const task of this.tasks) {
			this.scheduleNext(task);
		}
	}

	public stop(): void {
		this.started = false;
		for (const task of this.tasks) {
			if (task.timer) {
				clearTimeout(task.timer);
				task.timer = undefined;
			}
		}
	}

	public schedule(pluginName: string, cronExp: string, callback: CronCallback): boolean {
		try {
			CronExpressionParser.parse(cronExp);
		} catch (err) {
			logger.error(
				`Scheduler: Invalid cron expression "${cronExp}" for [${pluginName}]`,
				err,
			);
			return false;
		}

		const task: ScheduledTask = { pluginName, cronExp, callback };
		this.tasks.add(task);
		logger.debug(`Scheduler: [${pluginName}] Scheduled task: ${cronExp}`);

		if (this.started) {
			this.scheduleNext(task);
		}
		return true;
	}

	public clearTasks(pluginName: string): void {
		let count = 0;
		for (const task of this.tasks) {
			if (task.pluginName === pluginName) {
				if (task.timer) {
					clearTimeout(task.timer);
				}
				this.tasks.delete(task);
				count++;
			}
		}
		if (count > 0) {
			logger.debug(`Scheduler: Cleared ${count} task(s) for [${pluginName}]`);
		}
	}

	private scheduleNext(task: ScheduledTask): void {
		if (task.timer) {
			clearTimeout(task.timer);
			task.timer = undefined;
		}

		try {
			const interval = CronExpressionParser.parse(task.cronExp);
			const nextDate = interval.next();
			const delay = nextDate.getTime() - Date.now();

			if (delay < 0) {
				task.timer = setTimeout(() => this.executeAndReschedule(task), 60_000);
			} else {
				task.timer = setTimeout(() => this.executeAndReschedule(task), delay);
			}
		} catch (err) {
			logger.error(
				`Scheduler: Failed to compute next run for [${task.pluginName}] (${task.cronExp})`,
				err,
			);
		}
	}

	private async executeAndReschedule(task: ScheduledTask): Promise<void> {
		if (this.runningTasks.has(task)) return;

		this.runningTasks.add(task);
		try {
			await task.callback();
		} catch (err) {
			logger.error(`Scheduler: [${task.pluginName}] Task error`, err);
		} finally {
			this.runningTasks.delete(task);
		}

		if (this.started && this.tasks.has(task)) {
			this.scheduleNext(task);
		}
	}
}

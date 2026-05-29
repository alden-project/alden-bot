export abstract class Event {
	private _isCancelled = false;

	public cancel(): void {
		this._isCancelled = true;
	}

	public uncancel(): void {
		this._isCancelled = false;
	}

	public get isCancelled(): boolean {
		return this._isCancelled;
	}
}

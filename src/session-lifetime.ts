export class SessionLifetime {
  private active = false;

  activate(): void {
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
  }

  get isActive(): boolean {
    return this.active;
  }
}

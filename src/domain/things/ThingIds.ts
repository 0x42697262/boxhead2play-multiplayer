export class ThingIds {
  private last = 0;

  allocate(): number {
    this.last++;
    return this.last;
  }

  renew(): void {
    this.last = 0;
  }
}

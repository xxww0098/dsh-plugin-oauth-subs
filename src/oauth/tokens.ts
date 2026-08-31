/** Refresh-aware session loader. Preempts expiry and drops permanent failures. */

export class TokenManager {
  constructor({ displayName, preemptMs, load, save, remove, refresh, isPermanent, onRemoved }) {
    this.displayName = displayName
    this.preemptMs = preemptMs
    this.load = load
    this.save = save
    this.remove = remove
    this.refresh = refresh
    this.isPermanent = isPermanent
    this.onRemoved = onRemoved
    this.inflight = undefined
  }

  async session() {
    if (this.inflight) return this.inflight
    this.inflight = this.#resolve().finally(() => {
      this.inflight = undefined
    })
    return this.inflight
  }

  async remember(fields) {
    const current = await this.load()
    if (current === undefined) return
    await this.save({ ...current, ...fields })
  }

  async #resolve() {
    const current = await this.load()
    if (current === undefined) {
      throw new Error(`${this.displayName} is not logged in`)
    }
    if (current.expiresAt - Date.now() > this.preemptMs) return current
    try {
      const next = await this.refresh(current)
      await this.save(next)
      return next
    } catch (error) {
      if (this.isPermanent(error)) {
        await this.remove()
        this.onRemoved?.()
        throw new Error(`${this.displayName} login expired; sign in again`)
      }
      throw error
    }
  }
}

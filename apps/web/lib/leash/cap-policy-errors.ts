export class LeashAgentNotFoundError extends Error {
  constructor() {
    super("The Leash agent was not found");
    this.name = "LeashAgentNotFoundError";
  }
}

export class LeashCapNotFoundError extends Error {
  constructor() {
    super("The Leash cap was not found");
    this.name = "LeashCapNotFoundError";
  }
}

export class LeashAgentNotFoundError extends Error {
  constructor() {
    super("The agent was not found");
    this.name = "LeashAgentNotFoundError";
  }
}

export class LeashCapNotFoundError extends Error {
  constructor() {
    super("The Agent cap was not found");
    this.name = "LeashCapNotFoundError";
  }
}

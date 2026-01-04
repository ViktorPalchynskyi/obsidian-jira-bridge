import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventBus } from "../../../src/core/EventBus";

describe("EventBus", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe("on/emit", () => {
    it("should call handler when event is emitted", async () => {
      const handler = vi.fn();
      eventBus.on("test", handler);

      await eventBus.emit("test", { data: "value" });

      expect(handler).toHaveBeenCalledWith({ data: "value" });
    });

    it("should call multiple handlers", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      eventBus.on("test", handler1);
      eventBus.on("test", handler2);

      await eventBus.emit("test", "payload");

      expect(handler1).toHaveBeenCalledWith("payload");
      expect(handler2).toHaveBeenCalledWith("payload");
    });
  });

  describe("off", () => {
    it("should remove handler", async () => {
      const handler = vi.fn();
      eventBus.on("test", handler);
      eventBus.off("test", handler);

      await eventBus.emit("test", "payload");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("on return value", () => {
    it("should return unsubscribe function", async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on("test", handler);

      unsubscribe();
      await eventBus.emit("test", "payload");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("once", () => {
    it("should call handler only once", async () => {
      const handler = vi.fn();
      eventBus.once("test", handler);

      await eventBus.emit("test", "first");
      await eventBus.emit("test", "second");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("first");
    });
  });

  describe("clear", () => {
    it("should remove all handlers", async () => {
      const handler = vi.fn();
      eventBus.on("test", handler);

      eventBus.clear();
      await eventBus.emit("test", "payload");

      expect(handler).not.toHaveBeenCalled();
    });
  });
});

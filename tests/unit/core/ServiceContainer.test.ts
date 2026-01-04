import { describe, it, expect, beforeEach } from "vitest";
import { ServiceContainer } from "../../../src/core/ServiceContainer";

describe("ServiceContainer", () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  describe("register", () => {
    it("should register and retrieve an instance", () => {
      const token = { name: "TestService" };
      const instance = { value: 42 };

      container.register(token, instance);

      expect(container.get(token)).toBe(instance);
    });
  });

  describe("registerSingleton", () => {
    it("should create instance only once", () => {
      const token = { name: "SingletonService" };
      let callCount = 0;

      container.registerSingleton(token, () => {
        callCount++;
        return { id: callCount };
      });

      const first = container.get(token);
      const second = container.get(token);

      expect(first).toBe(second);
      expect(callCount).toBe(1);
    });
  });

  describe("registerTransient", () => {
    it("should create new instance each time", () => {
      const token = { name: "TransientService" };
      let callCount = 0;

      container.registerTransient(token, () => {
        callCount++;
        return { id: callCount };
      });

      const first = container.get(token);
      const second = container.get(token);

      expect(first).not.toBe(second);
      expect(callCount).toBe(2);
    });
  });

  describe("get", () => {
    it("should throw error for unregistered service", () => {
      const token = { name: "UnknownService" };

      expect(() => container.get(token)).toThrow("Service not registered: UnknownService");
    });
  });

  describe("has", () => {
    it("should return true for registered service", () => {
      const token = { name: "TestService" };
      container.register(token, {});

      expect(container.has(token)).toBe(true);
    });

    it("should return false for unregistered service", () => {
      const token = { name: "UnknownService" };

      expect(container.has(token)).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should clear all services", () => {
      const token = { name: "TestService" };
      container.register(token, {});

      container.dispose();

      expect(container.has(token)).toBe(false);
    });
  });
});

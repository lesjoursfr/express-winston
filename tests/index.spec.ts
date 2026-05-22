import chalk from "chalk";
import { describe, it } from "mocha";
import assert from "node:assert/strict";
import { defaultSkip, errorLogger, logger } from "../src/index.js";

type LogEntry = {
  level?: string;
  message?: string;
};

function createFakeLogger(loggedEntries: LogEntry[]) {
  return {
    log(entry: LogEntry) {
      loggedEntries.push(entry);
    },
  };
}

describe("express-winston", () => {
  it("defaultSkip returns false", () => {
    assert.equal(defaultSkip(), false);
  });

  it("logger logs expected winston message", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = logger({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      winstonInstance: winstonInstance as any,
      msg: "HTTP {{req.method}} {{req.url}} {{res.statusCode}}",
    });

    const req = {
      method: "GET",
      url: "/users",
      originalUrl: "/users",
      headers: {},
      httpVersion: "1.1",
      query: {},
    };

    const res = {
      statusCode: 201,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    };

    let nextCalled = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).end("created");

    assert.equal(loggedEntries.length, 1);
    assert.equal(loggedEntries[0].message, "HTTP GET /users 201");
  });

  it("errorLogger logs expected winston message", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = errorLogger({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      winstonInstance: winstonInstance as any,
      msg: "Error {{err.message}} on {{req.method}} {{req.url}}",
    });

    const req = {
      method: "POST",
      url: "/users",
      originalUrl: "/users",
      headers: {},
      httpVersion: "1.1",
      query: {},
    };

    const res = {
      statusCode: 500,
    };

    const err = new Error("boom");
    let forwardedError: Error | undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(err, req as any, res as any, (nextErr?: any) => {
      forwardedError = nextErr;
    });

    assert.equal(forwardedError, err);
    assert.equal(loggedEntries.length, 1);
    assert.equal(loggedEntries[0].message, "Error boom on POST /users");
  });

  it("logger supports function message with interpolation", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = logger({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      winstonInstance: winstonInstance as any,
      msg: (_req, _res) => "fn {{req.method}} {{req.url}} {{res.statusCode}}",
    });

    const req = {
      method: "PATCH",
      url: "/accounts/42",
      originalUrl: "/accounts/42",
      headers: {},
      httpVersion: "1.1",
      query: {},
    };

    const res = {
      statusCode: 202,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).end("accepted");

    assert.equal(loggedEntries.length, 1);
    assert.equal(loggedEntries[0].message, "fn PATCH /accounts/42 202");
  });

  it("logger does not log when skip returns true", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = logger({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      winstonInstance: winstonInstance as any,
      msg: "HTTP {{req.method}} {{req.url}} {{res.statusCode}}",
      skip: () => true,
    });

    const req = {
      method: "GET",
      url: "/health",
      originalUrl: "/health",
      headers: {},
      httpVersion: "1.1",
      query: {},
    };

    const res = {
      statusCode: 200,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).end("ok");

    assert.equal(loggedEntries.length, 0);
  });

  it("logger logs expected expressFormat message", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);
    const originalNow = Date.now;

    const middleware = logger({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      winstonInstance: winstonInstance as any,
      expressFormat: true,
    });

    const req = {
      method: "DELETE",
      url: "/sessions/7",
      originalUrl: "/sessions/7",
      headers: {},
      httpVersion: "1.1",
      query: {},
    };

    const res = {
      statusCode: 204,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    };

    try {
      Date.now = () => 1000;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      middleware(req as any, res as any, () => undefined);
      Date.now = () => 1042;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res as any).end();
    } finally {
      Date.now = originalNow;
    }

    assert.equal(loggedEntries.length, 1);
    assert.equal(loggedEntries[0].message, "DELETE /sessions/7 204 42ms");
  });

  it("errorLogger supports function message with interpolation", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = errorLogger({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      winstonInstance: winstonInstance as any,
      msg: (_req, _res) => "ERR {{req.method}} {{req.url}} {{res.statusCode}}",
    });

    const req = {
      method: "PUT",
      url: "/orders/55",
      originalUrl: "/orders/55",
      headers: {},
      httpVersion: "1.1",
      query: {},
    };

    const res = {
      statusCode: 503,
    };

    const err = new Error("unavailable");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(err, req as any, res as any, () => undefined);

    assert.equal(loggedEntries.length, 1);
    assert.equal(loggedEntries[0].message, "ERR PUT /orders/55 503");
  });

  it("errorLogger does not log when skip returns true", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = errorLogger({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      winstonInstance: winstonInstance as any,
      msg: "Error {{err.message}} on {{req.method}} {{req.url}}",
      skip: () => true,
    });

    const req = {
      method: "POST",
      url: "/payments",
      originalUrl: "/payments",
      headers: {},
      httpVersion: "1.1",
      query: {},
    };

    const res = {
      statusCode: 500,
    };

    const err = new Error("boom");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(err, req as any, res as any, () => undefined);

    assert.equal(loggedEntries.length, 0);
  });

  it("logger logs expected colorized expressFormat message", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);
    const originalNow = Date.now;

    const middleware = logger({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      winstonInstance: winstonInstance as any,
      expressFormat: true,
      colorize: true,
    });

    const req = {
      method: "GET",
      url: "/colorized",
      originalUrl: "/colorized",
      headers: {},
      httpVersion: "1.1",
      query: {},
    };

    const res = {
      statusCode: 404,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    };

    try {
      Date.now = () => 2000;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      middleware(req as any, res as any, () => undefined);
      Date.now = () => 2009;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res as any).end("not found");
    } finally {
      Date.now = originalNow;
    }

    const expectedMessage = chalk.grey("GET /colorized") + " " + chalk.yellow("404") + " " + chalk.grey("9ms");

    assert.equal(loggedEntries.length, 1);
    assert.equal(loggedEntries[0].message, expectedMessage);
  });

  it("logger statusLevels maps level by status code", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = logger({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      winstonInstance: winstonInstance as any,
      msg: "HTTP {{req.method}} {{req.url}} {{res.statusCode}}",
      statusLevels: true,
    });

    const req = {
      method: "GET",
      url: "/level",
      originalUrl: "/level",
      headers: {},
      httpVersion: "1.1",
      query: {},
    };

    const res = {
      statusCode: 200,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).statusCode = 200;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).end("ok");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).statusCode = 404;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).end("warn");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).statusCode = 500;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).end("error");

    assert.equal(loggedEntries.length, 3);
    assert.equal(loggedEntries[0].message, "HTTP GET /level 200");
    assert.equal(loggedEntries[1].message, "HTTP GET /level 404");
    assert.equal(loggedEntries[2].message, "HTTP GET /level 500");
    assert.equal(loggedEntries[0].level, "info");
    assert.equal(loggedEntries[1].level, "warn");
    assert.equal(loggedEntries[2].level, "error");
  });
});

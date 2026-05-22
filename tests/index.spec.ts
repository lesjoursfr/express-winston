import chalk from "chalk";
import { Request, Response } from "express";
import { describe, it } from "mocha";
import assert from "node:assert/strict";
import winston from "winston";
import { defaultSkip, errorLogger, logger } from "../src/index.js";

type LogEntry = {
  level?: string;
  message?: string;
};

function createFakeLogger(loggedEntries: LogEntry[]): winston.Logger {
  return {
    log(entry: LogEntry) {
      loggedEntries.push(entry);
    },
  } as unknown as winston.Logger;
}

describe("express-winston", () => {
  it("defaultSkip returns false", () => {
    assert.equal(defaultSkip(), false);
  });

  it("logger logs expected winston message", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = logger({
      winstonInstance: winstonInstance,
      msg: "HTTP {{req.method}} {{req.url}} {{res.statusCode}}",
    });

    const req = {
      method: "GET",
      url: "/users",
      originalUrl: "/users",
      headers: {},
      httpVersion: "1.1",
      query: {},
    } as unknown as Request;

    const res = {
      statusCode: 201,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    } as unknown as Response;

    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);

    res.end("created");

    assert.equal(loggedEntries.length, 1);
    assert.equal(loggedEntries[0].message, "HTTP GET /users 201");
  });

  it("errorLogger logs expected winston message", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = errorLogger({
      winstonInstance: winstonInstance,
      msg: "Error {{err.message}} on {{req.method}} {{req.url}}",
    });

    const req = {
      method: "POST",
      url: "/users",
      originalUrl: "/users",
      headers: {},
      httpVersion: "1.1",
      query: {},
    } as unknown as Request;

    const res = {
      statusCode: 500,
    } as unknown as Response;

    const err = new Error("boom");
    let forwardedError: Error | undefined;

    middleware(err, req, res, (nextErr) => {
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
      winstonInstance: winstonInstance,
      msg: (_req, _res) => "fn {{req.method}} {{req.url}} {{res.statusCode}}",
    });

    const req = {
      method: "PATCH",
      url: "/accounts/42",
      originalUrl: "/accounts/42",
      headers: {},
      httpVersion: "1.1",
      query: {},
    } as unknown as Request;

    const res = {
      statusCode: 202,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    } as unknown as Response;

    middleware(req, res, () => undefined);
    res.end("accepted");

    assert.equal(loggedEntries.length, 1);
    assert.equal(loggedEntries[0].message, "fn PATCH /accounts/42 202");
  });

  it("logger does not log when skip returns true", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = logger({
      winstonInstance: winstonInstance,
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
    } as unknown as Request;

    const res = {
      statusCode: 200,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    } as unknown as Response;

    middleware(req, res, () => undefined);
    res.end("ok");

    assert.equal(loggedEntries.length, 0);
  });

  it("logger logs expected expressFormat message", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);
    const originalNow = Date.now;

    const middleware = logger({
      winstonInstance: winstonInstance,
      expressFormat: true,
    });

    const req = {
      method: "DELETE",
      url: "/sessions/7",
      originalUrl: "/sessions/7",
      headers: {},
      httpVersion: "1.1",
      query: {},
    } as unknown as Request;

    const res = {
      statusCode: 204,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    } as unknown as Response;

    try {
      Date.now = () => 1000;
      middleware(req, res, () => undefined);
      Date.now = () => 1042;
      res.end();
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
      winstonInstance: winstonInstance,
      msg: (_req, _res) => "ERR {{req.method}} {{req.url}} {{res.statusCode}}",
    });

    const req = {
      method: "PUT",
      url: "/orders/55",
      originalUrl: "/orders/55",
      headers: {},
      httpVersion: "1.1",
      query: {},
    } as unknown as Request;

    const res = {
      statusCode: 503,
    } as unknown as Response;

    const err = new Error("unavailable");

    middleware(err, req, res, () => undefined);

    assert.equal(loggedEntries.length, 1);
    assert.equal(loggedEntries[0].message, "ERR PUT /orders/55 503");
  });

  it("errorLogger does not log when skip returns true", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);

    const middleware = errorLogger({
      winstonInstance: winstonInstance,
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
    } as unknown as Request;

    const res = {
      statusCode: 500,
    } as unknown as Response;

    const err = new Error("boom");

    middleware(err, req, res, () => undefined);

    assert.equal(loggedEntries.length, 0);
  });

  it("logger logs expected colorized expressFormat message", () => {
    const loggedEntries: LogEntry[] = [];
    const winstonInstance = createFakeLogger(loggedEntries);
    const originalNow = Date.now;

    const middleware = logger({
      winstonInstance: winstonInstance,
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
    } as unknown as Request;

    const res = {
      statusCode: 404,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    } as unknown as Response;

    try {
      Date.now = () => 2000;
      middleware(req, res, () => undefined);
      Date.now = () => 2009;
      res.end("not found");
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
      winstonInstance: winstonInstance,
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
    } as unknown as Request;

    const res = {
      statusCode: 200,
      end() {
        return this;
      },
      getHeader() {
        return "text/plain";
      },
    } as unknown as Response;

    middleware(req, res, () => undefined);

    res.statusCode = 200;
    res.end("ok");

    res.statusCode = 404;
    middleware(req, res, () => undefined);
    res.end("warn");

    res.statusCode = 500;
    middleware(req, res, () => undefined);
    res.end("error");

    assert.equal(loggedEntries.length, 3);
    assert.equal(loggedEntries[0].message, "HTTP GET /level 200");
    assert.equal(loggedEntries[1].message, "HTTP GET /level 404");
    assert.equal(loggedEntries[2].message, "HTTP GET /level 500");
    assert.equal(loggedEntries[0].level, "info");
    assert.equal(loggedEntries[1].level, "warn");
    assert.equal(loggedEntries[2].level, "error");
  });
});

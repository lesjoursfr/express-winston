import chalk from "chalk";
import { ErrorRequestHandler, Handler, NextFunction, Request, Response } from "express";
import * as _ from "lodash";
import { Format } from "logform";
import * as winston from "winston";
import * as Transport from "winston-transport";

export type ExceptionToMetaFunction = (err: Error) => object;
export type DynamicMetaFunction = (req: Request, res: Response, err?: Error) => object;
export type DynamicLevelFunction = (req: Request, res: Response, err?: Error) => string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RequestFilter = (req: Request, propName: string) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResponseFilter = (res: Response, propName: string) => any;
export type RouteFilter = (req: Request, res: Response) => boolean;
export type ErrorRouteFilter = (req: Request, res: Response, err: Error) => boolean;
export type MessageTemplate = string | ((req: Request, res: Response) => string);

/**
 * A default list of properties in the request object that are allowed to be logged.
 * These properties will be safely included in the meta of the log.
 * 'body' is not included in this list because it can contains passwords and stuff that are sensitive for logging.
 * TODO: Include 'body' and get the defaultRequestFilter to filter the inner properties like 'password' or 'password_confirmation', etc. Pull requests anyone?
 * @type {Array}
 */
export const requestWhitelist: Array<string> = ["url", "headers", "method", "httpVersion", "originalUrl", "query"];

/**
 * A default list of properties in the request body that are allowed to be logged.
 * This will normally be empty here, since it should be done at the route level.
 * @type {Array}
 */
export const bodyWhitelist: Array<string> = [];

/**
 * A default list of properties in the request body that are not allowed to be logged.
 * @type {Array}
 */
export const bodyBlacklist: Array<string> = [];

/**
 * A default list of properties in the response object that are allowed to be logged.
 * These properties will be safely included in the meta of the log.
 * @type {Array}
 */
export const responseWhitelist: Array<string> = ["statusCode"];

/**
 * A list of request routes that will be skipped instead of being logged. This would be useful if routes for health checks or pings would otherwise pollute
 * your log files.
 * @type {Array}
 */
export const ignoredRoutes: Array<string> = [];

/**
 * A default function to filter the properties of the req object.
 * @param {Request} req
 * @param {string} propName
 * @return {*}
 */
export const defaultRequestFilter: RequestFilter = function (req: Request, propName: string) {
  return _.get(req, propName);
};

/**
 * A default list of headers in the request object that are not allowed to be logged.
 * @type {Array}
 */
export const defaultHeaderBlacklist: Array<string> = [];

/**
 * A default function to filter the properties of the res object.
 * @param {Response} res
 * @param {string} propName
 * @return {*}
 */
export const defaultResponseFilter: ResponseFilter = function (res: Response, propName: string) {
  return _.get(res, propName);
};

/**
 * A default function to decide whether skip logging of particular request. Doesn't skip anything (i.e. log all requests).
 * @return always false
 */
export function defaultSkip(): boolean {
  return false;
}

/**
 * The property of the metadata of the log entry that the filtered HTTP request is stored in (default 'req')
 * @type {string}
 */
export const requestField = "req";

/**
 * The property of the metadata of the log entry that the filtered HTTP response is stored in (default 'res')
 * @type {string}
 */
export const responseField = "res";

export interface ErrorLoggerOptions {
  transports: Transport[];
  winstonInstance: winston.Logger;
  baseMeta: object;
  dynamicMeta: DynamicMetaFunction;
  exceptionToMeta: ExceptionToMetaFunction;
  format: Format;
  level: string | DynamicLevelFunction;
  meta: boolean;
  metaField: string | null;
  requestField: string | null;
  responseField: string | null;
  msg: MessageTemplate;
  requestFilter: RequestFilter;
  requestWhitelist: string[];
  headerBlacklist: string[];
  blacklistedMetaFields: string[];
  skip: ErrorRouteFilter;
}

function filterObject<T = Request | Response>(
  originalObj: T,
  whiteList: string[],
  headerBlacklist: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialFilter: (reqOrRes: T, propName: string) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { [key: string]: any } | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj: { [key: string]: any } = {};
  let fieldsSet = false;

  ([] as Array<string>).concat(whiteList).forEach(function (propName) {
    const value = initialFilter(originalObj, propName);
    if (typeof value !== "undefined") {
      _.set(obj, propName, value);
      fieldsSet = true;
      if (propName === "headers") {
        ([] as Array<string>).concat(headerBlacklist).forEach(function (headerName) {
          const lowerCaseHeaderName = headerName.toLowerCase();
          if (Object.prototype.hasOwnProperty.call(obj[propName], lowerCaseHeaderName)) {
            delete obj[propName][lowerCaseHeaderName];
          }
        });
      }
    }
  });

  return fieldsSet ? obj : undefined;
}

function getTemplate(
  loggerOptions: LoggerOptions | ErrorLoggerOptions,
  templateOptions: _.TemplateOptions
): _.TemplateExecutor {
  if ((loggerOptions as LoggerOptions).expressFormat === true) {
    let expressMsgFormat = "{{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms";
    if ((loggerOptions as LoggerOptions).colorize === true) {
      expressMsgFormat =
        chalk.grey("{{req.method}} {{req.url}}") + " {{res.statusCode}} " + chalk.grey("{{res.responseTime}}ms");
    }

    return _.template(expressMsgFormat, templateOptions);
  }

  if (!_.isFunction(loggerOptions.msg)) {
    return _.template(loggerOptions.msg, templateOptions);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (data: any): string {
    data = data || {};
    const m = (loggerOptions.msg as (req: Request, res: Response) => string)(data.req, data.res);

    // if there is no interpolation, don't waste resources creating a template.
    // this quick regex is still way faster than just blindly compiling a new template.
    if (!/\{\{/.test(m)) {
      return m;
    }
    // since options.msg was a function, and the results seem to contain moustache
    // interpolation, we'll compile a new template for each request.
    // Warning: this eats a ton of memory under heavy load.
    return _.template(m, templateOptions)(data);
  } as _.TemplateExecutor;
}

function errorLoggerOptionsWithDefaults(options: Partial<ErrorLoggerOptions>): ErrorLoggerOptions {
  let config = { ...options };

  config.requestWhitelist = config.requestWhitelist || requestWhitelist;
  config.requestFilter = config.requestFilter || defaultRequestFilter;
  config.headerBlacklist = config.headerBlacklist || defaultHeaderBlacklist;
  config.winstonInstance =
    config.winstonInstance ||
    winston.createLogger({
      transports: config.transports,
      format: config.format,
    });
  config.msg = config.msg || "middlewareError";
  config.baseMeta = config.baseMeta || {};
  config.metaField = config.metaField === null || config.metaField === "null" ? null : config.metaField || "meta";
  config.level = config.level || "error";
  config.dynamicMeta =
    config.dynamicMeta ||
    function (_req: Request, _res: Response): object {
      return {};
    };
  const exceptionHandler = new winston.ExceptionHandler(config.winstonInstance);
  config.exceptionToMeta = config.exceptionToMeta || exceptionHandler.getAllInfo.bind(exceptionHandler);
  config.blacklistedMetaFields = config.blacklistedMetaFields || [];
  config.skip = config.skip || defaultSkip;
  config.requestField =
    config.requestField === null || config.requestField === "null" ? null : config.requestField || requestField;

  // backwards comparability.
  // just in case they're using the same options object as the logger function.
  config = _.omit(config, "expressFormat");

  return config as ErrorLoggerOptions;
}

/**
 * Create an error logging middleware
 * @param {ErrorLoggerOptions} options
 * @returns {ErrorRequestHandler}
 */
export function errorLogger(options: Partial<ErrorLoggerOptions>): ErrorRequestHandler {
  ensureValidOptions(options);

  // Set default values for options
  const config = errorLoggerOptionsWithDefaults(options);

  // Using mustache style templating
  const template = getTemplate(config, { interpolate: /\{\{([\s\S]+?)\}\}/g });

  return function (err, req, res, next) {
    // Let winston gather all the error data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let exceptionMeta: { [key: string]: any } = _.omit(config.exceptionToMeta(err), config.blacklistedMetaFields);
    if (config.meta !== false) {
      if (config.requestField !== null) {
        exceptionMeta[config.requestField] = filterObject(
          req,
          config.requestWhitelist,
          config.headerBlacklist,
          config.requestFilter
        );
      }

      if (config.dynamicMeta) {
        const dynamicMeta = config.dynamicMeta(req, res, err);
        exceptionMeta = _.assign(exceptionMeta, dynamicMeta);
      }
    }

    if (config.metaField) {
      let fields;
      if (Array.isArray(config.metaField)) {
        fields = config.metaField;
      } else {
        fields = config.metaField.split(".");
      }
      _.chain(fields)
        .reverse()
        .forEach((field) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newMeta: { [key: string]: any } = {};
          newMeta[field] = exceptionMeta;
          exceptionMeta = newMeta;
        });
    }

    exceptionMeta = _.assign(exceptionMeta, config.baseMeta);

    const level = _.isFunction(config.level) ? config.level(req, res, err) : config.level;

    if (!config.skip(req, res, err)) {
      // This is fire and forget, we don't want logging to hold up the request so don't wait for the callback
      config.winstonInstance.log(
        _.merge(exceptionMeta, {
          level,
          message: template({ err: err, req: req, res: res }),
        })
      );
    }

    next(err);
  };
}

export interface StatusLevels {
  error?: string;
  success?: string;
  warn?: string;
}

export interface LoggerOptions {
  transports: Transport[];
  winstonInstance: winston.Logger;
  baseMeta: object;
  bodyBlacklist: string[];
  bodyWhitelist: string[];
  colorize: boolean;
  dynamicMeta: DynamicMetaFunction;
  expressFormat: boolean;
  format: Format;
  ignoreRoute: RouteFilter;
  ignoredRoutes: string[];
  level: string | DynamicLevelFunction;
  meta: boolean;
  metaField: string | null;
  requestField: string | null;
  responseField: string | null;
  msg: MessageTemplate;
  requestFilter: RequestFilter;
  requestWhitelist: string[];
  responseFilter: ResponseFilter;
  responseWhitelist: string[];
  headerBlacklist: string[];
  skip: RouteFilter;
  statusLevels: boolean | StatusLevels;
  allowFilterOutWhitelistedRequestBody: boolean;
}

function levelFromStatus(statusLevels: StatusLevels): DynamicLevelFunction {
  return function (_req: Request, res: Response): string {
    let level = "";
    if (res.statusCode >= 100) {
      level = statusLevels.success ?? "info";
    }
    if (res.statusCode >= 400) {
      level = statusLevels.warn ?? "warn";
    }
    if (res.statusCode >= 500) {
      level = statusLevels.error ?? "error";
    }
    return level;
  };
}

function loggerOptionsWithDefaults(options: Partial<LoggerOptions>): LoggerOptions {
  const config = { ...options };

  config.requestWhitelist = config.requestWhitelist || requestWhitelist;
  config.bodyWhitelist = config.bodyWhitelist || bodyWhitelist;
  config.bodyBlacklist = config.bodyBlacklist || bodyBlacklist;
  config.headerBlacklist = config.headerBlacklist || defaultHeaderBlacklist;
  config.responseWhitelist = config.responseWhitelist || responseWhitelist;
  config.requestFilter = config.requestFilter || defaultRequestFilter;
  config.responseFilter = config.responseFilter || defaultResponseFilter;
  config.ignoredRoutes = config.ignoredRoutes || ignoredRoutes;
  config.winstonInstance =
    config.winstonInstance ||
    winston.createLogger({
      transports: config.transports,
      format: config.format,
    });
  config.statusLevels = config.statusLevels || false;
  config.level = config.statusLevels
    ? levelFromStatus(config.statusLevels === true ? {} : config.statusLevels)
    : config.level || "info";
  config.msg = config.msg || "HTTP {{req.method}} {{req.url}}";
  config.baseMeta = config.baseMeta || {};
  config.metaField = config.metaField === null || config.metaField === "null" ? null : config.metaField || "meta";
  config.colorize = config.colorize || false;
  config.expressFormat = config.expressFormat || false;
  config.ignoreRoute =
    config.ignoreRoute ||
    function () {
      return false;
    };
  config.skip = config.skip || defaultSkip;
  config.dynamicMeta =
    config.dynamicMeta ||
    function (_req: Request, _res: Response): object {
      return {};
    };
  config.requestField =
    config.requestField === null || config.requestField === "null" ? null : config.requestField || requestField;
  config.responseField =
    config.responseField === null || config.responseField === "null" ? null : config.responseField || responseField;
  config.allowFilterOutWhitelistedRequestBody = !!config.allowFilterOutWhitelistedRequestBody || false;

  return config as LoggerOptions;
}

/**
 * Create a request logging middleware
 * @param {LoggerOptions} options
 * @returns {Handler}
 */
export function logger(options: Partial<LoggerOptions>): Handler {
  ensureValidOptions(options);
  ensureValidLoggerOptions(options);

  // Set default values for options
  const config = loggerOptionsWithDefaults(options);

  // Using mustache style templating
  const template = getTemplate(config, {
    interpolate: /\{\{(.+?)\}\}/g,
  });

  return function (
    req: Request & {
      _startTime: number;
      _routeWhitelists: { req: string[]; res: string[]; body: string[] };
      _routeBlacklists: { body: string[] };
    },
    res: Response & { responseTime: number; body: string },
    next: NextFunction
  ) {
    const coloredRes: { [key: string]: string } = {};

    const currentUrl = req.originalUrl || req.url;
    if (currentUrl && _.includes(config.ignoredRoutes, currentUrl)) return next();
    if (config.ignoreRoute(req, res)) return next();

    req._startTime = Date.now();

    req._routeWhitelists = {
      req: [],
      res: [],
      body: [],
    };

    req._routeBlacklists = {
      body: [],
    };

    // Manage to get information from the response too, just like Connect.logger does:
    const end = res.end;
    // @ts-expect-error TODO : Fix typing
    res.end = function (chunk, encoding) {
      res.responseTime = Date.now() - req._startTime;

      res.end = end;
      // @ts-expect-error TODO : Fix typing
      res.end(chunk, encoding);

      req.url = req.originalUrl || req.url;

      let meta = {};

      if (config.meta !== false) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let logData: { [key: string]: any } = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let filteredRequest: { [key: string]: any } | undefined;

        if (config.requestField !== null) {
          const requestWhitelist = config.requestWhitelist.concat(req._routeWhitelists.req || []);
          filteredRequest = filterObject(req, requestWhitelist, config.headerBlacklist, config.requestFilter);

          const bodyWhitelist = _.union(config.bodyWhitelist, req._routeWhitelists.body || []);
          const blacklist = _.union(config.bodyBlacklist, req._routeBlacklists.body || []);

          let filteredBody = null;

          if (req.body !== undefined) {
            if (blacklist.length > 0 && bodyWhitelist.length === 0) {
              const whitelist = _.difference(Object.keys(req.body), blacklist);
              filteredBody = filterObject(req.body, whitelist, config.headerBlacklist, config.requestFilter);
            } else if (
              requestWhitelist.indexOf("body") !== -1 &&
              bodyWhitelist.length === 0 &&
              blacklist.length === 0
            ) {
              filteredBody = filterObject(
                req.body,
                Object.keys(req.body),
                config.headerBlacklist,
                config.requestFilter
              );
            } else {
              filteredBody = filterObject(req.body, bodyWhitelist, config.headerBlacklist, config.requestFilter);
            }
          }

          if (filteredRequest && (!config.allowFilterOutWhitelistedRequestBody || filteredRequest.body !== undefined)) {
            if (filteredBody) {
              filteredRequest.body = filteredBody;
            } else {
              delete filteredRequest.body;
            }
          }

          logData[config.requestField] = filteredRequest;
        }

        const responseWhitelist = config.responseWhitelist.concat(req._routeWhitelists.res || []);
        if (_.includes(responseWhitelist, "body")) {
          if (chunk) {
            const contentType = res.getHeader("content-type");
            const isJson = typeof contentType === "string" && contentType.indexOf("json") >= 0 ? true : false;
            const body = chunk.toString();
            res.body = bodyToString(body, isJson);
          }
        }

        if (config.responseField !== null) {
          const filteredResponse = filterObject(res, responseWhitelist, config.headerBlacklist, config.responseFilter);
          if (filteredResponse) {
            if (config.requestField === config.responseField) {
              logData[config.requestField] = _.assign(filteredRequest, filteredResponse);
            } else {
              logData[config.responseField] = filteredResponse;
            }
          }
        }

        if (!responseWhitelist.includes("responseTime")) {
          logData.responseTime = res.responseTime;
        }

        if (config.dynamicMeta) {
          const dynamicMeta = config.dynamicMeta(req, res);
          logData = _.assign(logData, dynamicMeta);
        }

        meta = _.assign(meta, logData);
      }

      if (config.metaField) {
        let fields;
        if (Array.isArray(config.metaField)) {
          fields = config.metaField;
        } else {
          fields = config.metaField.split(".");
        }
        _.chain(fields)
          .reverse()
          .forEach((field) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newMeta: { [key: string]: any } = {};
            newMeta[field] = meta;
            meta = newMeta;
          });
      }

      meta = _.assign(meta, config.baseMeta);

      if (config.colorize) {
        // Palette from https://github.com/expressjs/morgan/blob/master/index.js#L190
        let statusColor: keyof typeof chalk = "green";
        if (res.statusCode >= 500) {
          statusColor = "red";
        } else if (res.statusCode >= 400) {
          statusColor = "yellow";
        } else if (res.statusCode >= 300) {
          statusColor = "cyan";
        }

        coloredRes.statusCode = chalk[statusColor](res.statusCode);
      }

      const msg = template({ req: req, res: _.assign({}, res, coloredRes) });

      // This is fire and forget, we don't want logging to hold up the request so don't wait for the callback
      if (!config.skip(req, res)) {
        const level = _.isFunction(config.level) ? config.level(req, res) : config.level;
        config.winstonInstance.log(_.merge(meta, { level, message: msg }));
      }
    };

    next();
  } as Handler;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeJSONParse(string: string): any {
  try {
    return JSON.parse(string);
  } catch (_err) {
    return undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bodyToString(body: any, isJSON: boolean): string {
  const stringBody = body && body.toString();
  if (isJSON) {
    return safeJSONParse(body) || stringBody;
  }
  return stringBody;
}

function ensureValidOptions(options: Partial<LoggerOptions> | Partial<ErrorLoggerOptions>): void {
  if (!options) {
    throw new Error("options are required by express-winston middleware");
  }
  if (!((options.transports && options.transports.length > 0) || options.winstonInstance)) {
    throw new Error("transports or a winstonInstance are required by express-winston middleware");
  }
  if (options.dynamicMeta && !_.isFunction(options.dynamicMeta)) {
    throw new Error("`dynamicMeta` express-winston option should be a function");
  }
}

function ensureValidLoggerOptions(options: Partial<LoggerOptions>): void {
  if (options.ignoreRoute && !_.isFunction(options.ignoreRoute)) {
    throw new Error("`ignoreRoute` express-winston option should be a function");
  }
}

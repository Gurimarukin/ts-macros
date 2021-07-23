import ts = require("typescript");
import { MacroTransformer } from "./transformer";
import * as path from "path";

export default {
    "$$loadEnv": (args, transformer) => {
        const extraPath = args.length && ts.isStringLiteral(args[0]) ? args[0].text:"";
        let dotenv;
        try {
            dotenv = require("dotenv");
        } catch {
            throw new Error("`loadEnv` macro called but `dotenv` module is not installed.");
        }
        if (extraPath) dotenv.config({path: path.join(transformer.dirname, extraPath)});
        else dotenv.config();
        transformer.props.optimizeEnv = true;
        return transformer.context.factory.createCallExpression(
            transformer.context.factory.createPropertyAccessExpression(
              transformer.context.factory.createCallExpression(
                transformer.context.factory.createIdentifier("require"),
                undefined,
                [transformer.context.factory.createStringLiteral("dotenv")]
              ),
              transformer.context.factory.createIdentifier("config")
            ),
            undefined,
            extraPath ? [transformer.context.factory.createObjectLiteralExpression(
              [transformer.context.factory.createPropertyAssignment(
                transformer.context.factory.createIdentifier("path"),
                transformer.context.factory.createStringLiteral(extraPath)
              )])]:[]
          )
    },
    "$$loadJSONAsEnv": (args, transformer) => {
      const extraPath = ts.isStringLiteral(args[0]) ? args[0].text:undefined;
      if (!extraPath) throw new Error("`loadJSONAsEnv` macro expects a path to the JSON file.");
      const json = require(path.join(transformer.dirname, extraPath));
      Object.assign(process.env, json);
      transformer.props.optimizeEnv = true;
      return undefined;
    },
    "$$inlineFunc": (args, transformer) => {
      const argsArr = [...args].reverse();
      const fn = argsArr.pop();
      if (!fn || !ts.isArrowFunction(fn)) throw new Error("`unwrapFunc` macro expects an arrow function as the first parameter.");
      if (!fn.parameters.length) return fn.body;
      const replacements = new Map();
      for (const param of fn.parameters) {
        if (ts.isIdentifier(param.name)) replacements.set(param.name.text, argsArr.pop());
      }
      const visitor = (node: ts.Node): ts.Node|undefined => {
        if (ts.isIdentifier(node) && replacements.has(node.text)) return replacements.get(node.text);
        return ts.visitEachChild(node, visitor, transformer.context);
      };
      const newFn = ts.visitEachChild(fn, visitor, transformer.context);
      if ("statements" in newFn.body) return transformer.context.factory.createImmediatelyInvokedArrowFunction(newFn.body.statements);
      return newFn.body;
    },
    "$$kindof": (args, transformer) => { 
      if (!args.length) throw new Error("`kindof` macro expects a single parameter.");
      return transformer.context.factory.createNumericLiteral(args[0].kind);
    }
} as Record<string, (args: ts.NodeArray<ts.Expression>, transformer: MacroTransformer) => ts.Node|undefined>
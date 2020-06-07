export interface packageJSON {
  name: string;
  version: string;
  description: string;
  main: "dist/index.js";
  scripts: {
    prepare: "tsc";
    test: 'echo "Error: no test specified" && exit 1';
  };
  author: string;
  license: string;
  dependencies: { [propName: string]: string };
  devDependencies: { [propName: string]: string };
  [propName: string]: any;
}

export interface BuildOptions {
  language: "TypeScript" | "JavaScript";
  newSource?: string;
  port?: number;
}

export interface RouteData {
  type: "func";
  doc: DocString;
  params: { id: string; optional: boolean; inline: boolean; type: FullType }[];
  method: "get" | "post";
  path: string;
  return: FullType;
}
export interface MultiRoute {
  [propName: string]:
    | {
        type: "export";
        export: MultiRoute;
      }
    | RouteData;
}

export interface DocString {
  comment: string;
  params: { [propName: string]: { comment: string; type: FullType } };
  return: { type: FullType; comment: string };
}

export interface BaseType {
  type: "number" | "string" | "void" | "null" | "boolean";
}
export interface ArrayType {
  type: "array";
  value: FullType;
}
export interface SetType {
  type: "set";
  value: FullType;
}
export interface ObjectType {
  type: "object";
  value: { [propName: string]: FullType };
}
export interface UnionType {
  type: "union";
  value: FullType[];
}
export type FullType = BaseType | ArrayType | SetType | ObjectType | UnionType;

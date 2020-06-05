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
  params: { id: string; optional: boolean; inline: boolean; type: any }[];
  method: "get" | "post";
  path: string;
  returnType: string[];
}
export interface MultiRoute {
  [propName: string]:
    | {
        type: "export";
        export: MultiRoute;
      }
    | RouteData;
}

export interface DocPart {
  id: string;
  comment: string;
  type: string;
}
export interface DocString {
  comment: string;
  args: DocPart[];
  return: DocPart;
}

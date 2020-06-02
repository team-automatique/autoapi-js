# AutoAPI-JS

##### Build TypeScript and JavaScript functions automatically into a REST API

### Installing

This package can be added to an existing Node project via the command
`npm install @automatique/autoapi-js`

### Usage

AutoAPI-JS currently exports two major functions, `buildJSExpress` and `buildTSExpress`. The purpose
of this package is to automatically build REST APIs from simple JavaScript/TypeScript functions. The functions
that are turned into APIs are those that are in the `default export` of the main file specified to either
`buildJSExpress` or `buildTSExpress`.

Hello World Example:

`index.ts`:

```typescript
function hello() {
  return "Hello world";
}

export default {
  hello: hello,
};
```

Running the below buildTSExpress function with the above snippet in `index.ts` will generate an API,
with a single path, `/hello` which executes and returns the result of the function `hello()`

```typescript
// Build an API
buildTSExpress(
  // Project root
  "/some/path/to/a/typescript/project",
  // Main file
  "index.ts"
);
```

The above returns an object with three attributes, "index", the text of an index.ts script,
"packageJSON", a package.json file, and "tsConfig", a valid typescript config.

Note there are some changes in the source file that must be made to correctly work

1. URL Paths are case-insensitive, unlike JavaScript/TypeScript identifiers. If you attempt to export 2 functions with the same name, differing by casing (eg foo() and FOO()), undefined behaviour will occur

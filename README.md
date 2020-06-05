# AutoAPI-JS

### Build TypeScript and JavaScript functions automatically into a REST API

###### Note: it is _HIGHLY_ recommended that you use TypeScript. The typing system using in TypeScript will let you produce a much more reliable and better documented API

### Installing

This package can be added to an existing Node project via the command
`npm install @automatique/autoapi-js`

### Usage

AutoAPI-JS currently exports one function, `buildExpress`. The purpose
of this package is to automatically build REST APIs from simple JavaScript/TypeScript functions. The functions
that are turned into APIs are those that are in the `default export`(typescript or javascript) or `module.exports =`(javascript)
of the main file specified to `buildExpress`

#### Hello Automatique: TypeScript

`index.ts`:

```typescript
function hello(): string {
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
buildExpress(
  // Project root
  "/some/path/to/a/typescript/project",
  // Main file
  "index.ts",
  // Options
  { newSource: "app.ts", language: "TypeScript", port: 5000 }
);
```

The above returns an object with three attributes, "index", the text of an index.ts script,
"packageJSON", a JSON object representing a package.json file, and "tsConfig",
a valid typescript config JSON object. Additionally, it returns "routeData", which provides
a summary of the generated API

#### Hello Automatique: JavaScript

`index.js`

```javascript
function hello() {
  return "Hello world";
}
module.exports = {
  hello,
};
```

```javascript
// Build an API
buildExpress(
  // Project root
  "/some/path/to/a/typescript/project",
  // Main file
  "index.js",
  // Options
  { language: "JavaScript" }
);
```

#### A More Complex Example

APIs can also be built with nested exports, creating more structured endpoints. For example,
consider a **Math** API. We can build hierarchical exports, to export both functions and constants

```typescript
function calculateArea(length: number, height: number) {
  return length * height;
}

/**
 * @param {number} n the number to generate a factorial for
 * @return {number} the calculated factorial
 */

function factorial(n: number) {
  if (n === 1) return 1;
  return n * factorial(n - 1);
}
export default {
  geometry: {
    area: calculateArea,
    volume: (x: number, y: number, z: number) => x * y * z,
  },
  factorial,
  constants: {
    pi: () => 3.14159,
    e: () => 2.71828,
  },
};
```

As in the above, we can fluidly mix externally declared functions, shorthand object notation
and arrow functions. The above example will generate an API with paths

```
/geometry/area
/geometry/volume
/factorial
/constants/pi
/constants/e
```

Additionally, any JSDoc will be preserved in the generated API, such as the one for the function factorial above.

#### Optional Arguments

Normally, the generated API will perform a check for the existance of any declared parameters for a function. The exception to
this is if an initializer is provided or (typescript) the parameter is marked nullable. For example:

```typescript
function hello(name: string) {
  return `hello ${name}`;
}
function goodbye(name?: string) {
  if (name) return `Goodbye ${name}`;
  else return "Goodbye stranger";
}
export default {
  hello,
  goodbye,
};
```

In the generated API, calling /hello will result in a 400 response code, returning {error: "missing parameter name"}. However, calling
/goodbye?name=foobar and /goodbye will both return a 200 response code

### Notes

There are some changes in the source file that must be made to correctly work

1. URL Paths are case-insensitive, unlike JavaScript/TypeScript identifiers. If you attempt to export 2 functions with the same name, differing by casing (eg foo() and FOO()), undefined behaviour will occur

### Contributing

`autoapi-js` is an open-source project by Automatique. If you encounter bugs, find problems or just want to contribute features,
feel free to either open an issue or fork and make a pull request

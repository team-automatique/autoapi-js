# Generator-JS

##### Build JavaScript functions automatically into a REST API

### Installing

This package can be added to an existing Node project via the command
`npm install @automatique/generator-js`

### Usage

Generator-JS currently exports two functions, `buildJSExpress` and `buildTSExpress`.

Example Usage:

```javascript
// Build a program in memory, with the function "foo" exported, and no package dependencies
buildTSExpress(
  // Program
  {
    memory: true,
    raw: "function foo(){return 'bar';}",
  },
  // Functions to be exported
  {
    foo: { api: true },
  },
  // Packages required
  {}
);
```

The above returns an object with three attributes, "index", the text of an index.ts script,
"packageJSON", a package.json file, and "tsConfig", a valid typescript config.

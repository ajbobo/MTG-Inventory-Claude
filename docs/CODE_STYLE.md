# Code Style Guidelines

These are the formatting conventions used in this project. Apply these rules to maintain consistency.

## General Rules

1. **Brace Style**: K&R (One True Brace Style)
   - Opening brace on same line as statement
   - Closing brace always on its own line

2. **Arrow Functions**
   - Always use parentheses around parameters, even for single parameter
   - `(e) => { }` not `e => { }`

3. **Single-line Statements**
   - May omit braces if the statement fits on one line
   - Each statement should still be on its own line

## Control Structures

### if/else/else if

```javascript
if (condition) {
  // body
}
else if (condition) {
  // body
}
else {
  // body
}
```

- The closing `}` must be on its own line
- `else if` stays together on the next line after the `}`

### try/catch

```javascript
try {
  // body
}
catch (err) {
  // handler
}
```

- The closing `}` must be on its own line before `catch`

### while/for

```javascript
while (condition) {
  // body
}

for (let i = 0; i < 10; i++) {
  // body
}
```

## Callback Exceptions

For arrow functions used as callbacks with closing parenthesis, the pattern `});` is acceptable:

```javascript
array.forEach(item => {
  // body
});

element.addEventListener("click", (e) => {
  // handler
});
```

## Examples

**Correct:**
```javascript
setSelect.addEventListener("change", (e) => {
  const code = e.currentTarget.value;
  if (!code) {
    return;
  }
  doSomething();
});

if (condition)
  singleLineAction();
```

**Incorrect:**
```javascript
setSelect.addEventListener("change", e => {  // Missing parentheses
  // ...
}

if (condition) {
  // ...
} else if (other) {  // } and else should be on separate lines
  // ...
}

try {
  // ...
} catch (err) {  // } and catch should be on separate lines
  // ...
}
```

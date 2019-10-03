# `postcss-simple-themable-vars`

Fork of the [`postcss-simple-vars`](https://github.com/postcss/postcss-simple-vars) with theming support

## Install

```sh
$ yarn add ewnd9/postcss-simple-themable-vars
```

## Difference

You can pass a `theme` object with nested variables and get following transformation:

```js
{
  variables: {
    'font-size': '12pt',
  },
  themes: {
    'theme-1': {
      color: 'red',
    },
    'theme-2': {
      color: 'blue',
    },
  },
  globalCssModulesTheme: true,
}
```

```css
/* input */
.item {
  color: $color;
  font-size: $font-size;
}
```

```css
/* output */
.item {
  font-size: 12pt;
}

:global(.theme-1) .item {
  color: red;
}

:global(.theme-2) .item {
  color: blue;
}
```


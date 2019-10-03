var postcss = require('postcss')

function definition (variables, node, opts) {
  var name = node.prop.slice(1)
  variables[name] = node.value

  if (!opts.keep) {
    node.remove()
  }
}

function variable (themes, variables, node, str, name, opts, result) {
  if (opts.only) {
    if (typeof opts.only[name] !== 'undefined') {
      return opts.only[name]
    }

    return str
  }

  if (typeof variables[name] !== 'undefined') {
    return variables[name]
  }

  if (opts.silent) {
    return str
  }

  if (Object.entries(themes).some(([,variables]) => variables[name])) {
    return str
  }

  var fix = opts.unknown(node, name, result)

  if (fix) {
    return fix
  }

  return str
}

function simpleSyntax (themes, variables, node, str, opts, result) {
  return str.replace(/(^|[^\w])\$([\w\d-_]+)/g, function (_, bef, name) {
    return bef + variable(themes, variables, node, '$' + name, name, opts, result)
  })
}

function inStringSyntax (themes, variables, node, str, opts, result) {
  return str.replace(/\$\(\s*([\w\d-_]+)\s*\)/g, function (all, name) {
    return variable(themes, variables, node, all, name, opts, result)
  })
}

function bothSyntaxes (themes, variables, node, str, opts, result) {
  str = simpleSyntax(themes, variables, node, str, opts, result)
  str = inStringSyntax(themes, variables, node, str, opts, result)
  return str
}

function repeat (value, callback) {
  var oldValue
  var newValue = value
  do {
    oldValue = newValue
    newValue = callback(oldValue)
  } while (newValue !== oldValue && newValue.indexOf('$') !== -1)
  return newValue
}

function declValue (themes, variables, node, opts, result) {
  node.value = repeat(node.value, function (value) {
    return bothSyntaxes(themes, variables, node, value, opts, result)
  })
}

function declProp (themes, variables, node, opts, result) {
  node.prop = repeat(node.prop, function (value) {
    return inStringSyntax(themes, variables, node, value, opts, result)
  })
}

function ruleSelector (themes, variables, node, opts, result) {
  node.selector = repeat(node.selector, function (value) {
    return bothSyntaxes(themes, variables, node, value, opts, result)
  })
}

function atruleParams (themes, variables, node, opts, result) {
  node.params = repeat(node.params, function (value) {
    return bothSyntaxes(themes, variables, node, value, opts, result)
  })
}

function comment (themes, variables, node, opts, result) {
  node.text = node.text
    .replace(/<<\$\(\s*([\w\d-_]+)\s*\)>>/g, function (all, name) {
      return variable(themes, variables, node, all, name, opts, result)
    })
}

function isDeclWithVariables (node) {
  return node.type === 'decl' && node.value.toString().indexOf('$') !== -1
}

module.exports = postcss.plugin('postcss-simple-vars', function (opts) {
  if (typeof opts === 'undefined') opts = { }

  if (!opts.unknown) {
    opts.unknown = function (node, name) {
      throw node.error('Undefined variable $' + name)
    }
  }

  if (!opts.hasOwnProperty('keep')) {
    opts.keep = false
  }

  return function (css, result) {
    var variables = { }
    if (typeof opts.variables === 'function') {
      variables = opts.variables()
    } else if (typeof opts.variables === 'object') {
      for (var i in opts.variables) variables[i] = opts.variables[i]
    }

    for (var name in variables) {
      if (name[0] === '$') {
        var fixed = name.slice(1)
        variables[fixed] = variables[name]
        delete variables[name]
      }
    }

    var themes = { }
    if (typeof opts.themes === 'function') {
      themes = opts.themes()
    } else if (typeof opts.themes === 'object') {
      for (var i in opts.themes) {
        themes[i] = {}
        for (var j in opts.themes[i]) themes[i][j] = opts.themes[i][j]
      }
    }

    for (var theme in themes) {
      var themeVariables = themes[theme]

      for (var name in themeVariables) {
        if (name[0] === '$') {
          var fixed = name.slice(1)
          themeVariables[fixed] = themeVariables[name]
          delete themeVariables[name]
        }
      }
    }

    var toInsert = []

    css.walk(function (node) {
      if (node.type === 'decl') {
        if (node.value.toString().indexOf('$') !== -1) {
          declValue(themes, variables, node, opts, result)
        }
        if (node.prop.indexOf('$(') !== -1) {
          declProp(themes, variables, node, opts, result)
        } else if (node.prop[0] === '$') {
          if (!opts.only) definition(variables, node, opts)
        }
      } else if (node.type === 'rule') {
        if (node.selector.indexOf('$') !== -1) {
          ruleSelector(themes, variables, node, opts, result)
        }

        if (Object.keys(themes).length > 0 && node.nodes.some(node => isDeclWithVariables(node))) {
          toInsert.push({ node })
        }
      } else if (node.type === 'atrule') {
        if (node.params && node.params.indexOf('$') !== -1) {
          atruleParams(themes, variables, node, opts, result)
        }
      } else if (node.type === 'comment') {
        if (node.text.indexOf('$') !== -1) {
          comment(themes, variables, node, opts, result)
        }
      }
    })

    toInsert.forEach(({ node }) => {
      for (var [theme, variables] of Object.entries(themes).reverse()) {
        var clone = node.clone()
        var themeSelector = `.${theme}`

        if (opts.globalCssModulesTheme) {
          themeSelector = `:global(${themeSelector})`
        }

        clone.selector = `${themeSelector} ${clone.selector}`
        clone.nodes = clone.nodes
          .filter(isDeclWithVariables)
          .map(node => {
            declValue(themes, variables, node, opts, result)
            return node
          })

        node.parent.insertAfter(node, '\n' + clone.toString())
      }

      node.nodes = node.nodes.filter(node => !isDeclWithVariables(node))
    })

    Object.keys(variables).forEach(function (key) {
      result.messages.push({
        plugin: 'postcss-simple-vars',
        type: 'variable',
        name: key,
        value: variables[key]
      })
    })

    if (opts.onVariables) {
      opts.onVariables(variables)
    }
  }
})

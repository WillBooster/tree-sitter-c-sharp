(identifier) @variable

;; Methods

(method_declaration name: (identifier) @function.method)
(method_signature name: (identifier) @function.method)
(local_function_statement name: (identifier) @function)

;; Types

(interface_declaration name: (identifier) @type)
(class_declaration name: (identifier) @type)
(enum_declaration name: (identifier) @type)
(struct_declaration name: (identifier) @type)
(record_declaration name: (identifier) @type)
(namespace_declaration name: (identifier) @module)

(generic_name (identifier) @type)
(type_parameter (identifier) @property.definition)
(parameter type: (identifier) @type)
(type_argument_list (identifier) @type)
(as_expression right: (identifier) @type)
(is_pattern_expression pattern: (constant_pattern (identifier) @type))

(constructor_declaration name: (identifier) @constructor)
(destructor_declaration name: (identifier) @constructor)

(_ type: (identifier) @type)

(predefined_type) @type.builtin

;; Enum
(enum_member_declaration (identifier) @property.definition)

;; Literals

[
  (real_literal)
  (integer_literal)
] @number

[
  (character_literal)
  (string_literal)
  (raw_string_literal)
  (verbatim_string_literal)
  (interpolated_string_expression)
  (interpolation_start)
  (interpolation_quote)
 ] @string

(escape_sequence) @string.escape

[
  (boolean_literal)
  (null_literal)
] @constant.builtin

;; Comments

(comment) @comment

;; Tokens

[
  ";"
  "."
  ","
] @punctuation.delimiter

[
  "--"
  "-"
  "-="
  "&"
  "&="
  "&&"
  "+"
  "++"
  "+="
  "<"
  "<="
  "<<"
  "<<="
  "="
  "=="
  "!"
  "!="
  "=>"
  ">"
  ">="
  ">>"
  ">>="
  ">>>"
  ">>>="
  "|"
  "|="
  "||"
  "?"
  "??"
  "??="
  "^"
  "^="
  "~"
  "*"
  "*="
  "/"
  "/="
  "%"
  "%="
  ":"
  ".."
] @operator

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
  (interpolation_brace)
]  @punctuation.bracket

;; Keywords

(type_parameter_constraint "allows" @keyword)

[
  (modifier)
  "this"
  (implicit_type)
] @keyword

[
  "add"
  "alias"
  "as"
  "base"
  "break"
  "case"
  "catch"
  "checked"
  "class"
  "continue"
  "default"
  "delegate"
  "do"
  "else"
  "enum"
  "event"
  "explicit"
  "extern"
  "finally"
  "for"
  "foreach"
  "global"
  "goto"
  "if"
  "implicit"
  "interface"
  "is"
  "lock"
  "namespace"
  "notnull"
  "operator"
  "params"
  "return"
  "remove"
  "sizeof"
  "stackalloc"
  "static"
  "struct"
  "switch"
  "throw"
  "try"
  "typeof"
  "unchecked"
  "using"
  "while"
  "new"
  "await"
  "in"
  "yield"
  "get"
  "set"
  "when"
  "out"
  "ref"
  "from"
  "where"
  "select"
  "record"
  "init"
  "with"
  "let"
  "unsafe"
] @keyword

;; Attribute

(attribute name: (identifier) @attribute)

;; Parameters

(parameter
  name: (identifier) @variable.parameter)

;; Type constraints

(type_parameter_constraints_clause (identifier) @property.definition)

;; Members

[
  (field_declaration (variable_declaration (variable_declarator name: (identifier) @variable.member)))
  (event_field_declaration (variable_declaration (variable_declarator name: (identifier) @variable.member)))
  (property_declaration name: (identifier) @variable.member)
  (event_declaration name: (identifier) @variable.member)
  (object_creation_expression
    initializer: (initializer_expression (assignment_expression left: (identifier) @variable.member)))
  (implicit_object_creation_expression
    (initializer_expression (assignment_expression left: (identifier) @variable.member)))
  (assignment_expression
    right: (initializer_expression (assignment_expression left: (identifier) @variable.member)))
  (anonymous_object_creation_expression (identifier) @variable.member . "=")
  (with_initializer . (identifier) @variable.member)
  (member_access_expression name: (identifier) @variable.member)
  (member_access_expression name: (generic_name (identifier) @variable.member))
  (member_binding_expression name: (identifier) @variable.member)
  (member_binding_expression name: (generic_name (identifier) @variable.member))
]

;; Object initializer members inside conditional directives (alternative branches are omitted because each nested
;; pattern through `preproc_elif` or `preproc_else` adds noticeable query compilation time)

(object_creation_expression initializer: (initializer_expression (preproc_if (assignment_expression left: (identifier) @variable.member))))
(implicit_object_creation_expression (initializer_expression (preproc_if (assignment_expression left: (identifier) @variable.member))))
(assignment_expression right: (initializer_expression (preproc_if (assignment_expression left: (identifier) @variable.member))))

;; Calls

(invocation_expression
  function: [
    (identifier) @function.call
    (generic_name (identifier) @function.call)
    (member_access_expression name: (identifier) @function.method.call)
    (member_access_expression name: (generic_name (identifier) @function.method.call))
    (member_binding_expression name: (identifier) @function.method.call)
    (member_binding_expression name: (generic_name (identifier) @function.method.call))
  ])

["#:sdk" "#:package" "#:property" "#:project" "#:ref" "#:include" "#:exclude"] @keyword.directive
(file_directive_name) @property
(file_directive_value) @string

(file_directive_kind) @keyword.directive

(_ base: (identifier) @type)

(_ underlying_type: (identifier) @type)

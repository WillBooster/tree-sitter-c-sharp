/**
 * @file C# grammar for tree-sitter
 * @author Max Brunsfeld <maxbrunsfeld@gmail.com>
 * @author Damien Guard <damieng@gmail.com>
 * @author Amaan Qureshi <amaanq12@gmail.com>
 * @license MIT
 */

// @ts-check

const { alias, choice, field, grammar, optional, prec, repeat, repeat1, seq, sym, token } =
  /** @type {typeof globalThis & import('@willbooster/web-tree-sitter/dsl').DSL} */ (globalThis);

/** @typedef {'_preproc_expression' | '_top_level_item_no_statement' | '_namespace_body_item' | '_base_list_mixed_type' | '_base_list_mixed_suffix' | '_base_list_trivia' | '_base_list' | '_base_list_type' | '_base_list_suffix' | '_base_list_prefix' | '_base_list_separator' | '_base_list_separator_path' | '_enum_base_clause' | '_enum_base_type' | 'attribute_list' | 'declaration' | 'enum_member_declaration' | 'expression' | 'method_signature' | 'statement'} PreprocContentRule */

const PREC = {
  GENERIC: 19,
  DOT: 18,
  INVOCATION: 18,
  POSTFIX: 18,
  PREFIX: 17,
  UNARY: 17,
  CAST: 17,
  RANGE: 16,
  SWITCH: 15,
  WITH: 14,
  MULT: 13,
  ADD: 12,
  SHIFT: 11,
  REL: 10,
  EQUAL: 9,
  AND: 8,
  XOR: 7,
  OR: 6,
  LOGICAL_AND: 5,
  LOGICAL_OR: 4,
  COALESCING: 3,
  CONDITIONAL: 2,
  ASSIGN: 1,
  SELECT: 0,
};

const directiveHorizontal = String.raw` \t\v\f\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF`;
const directiveLineBreak = String.raw`\r\n\u0085\u2028\u2029`;
const directiveWhitespace = directiveHorizontal + directiveLineBreak;

const decimalDigitSequence = /([0-9][0-9_]*[0-9]|[0-9])/;

const stringEncoding = /(u|U)8/;

// oxlint-disable-next-line unicorn/prefer-module -- This package is CommonJS, so tree-sitter loads grammar.js as CommonJS.
module.exports = grammar({
  name: 'c_sharp',

  conflicts: ($) => [
    [$._simple_name, $._expression_simple_name, $._pattern_simple_identifier_name, $._ambiguous_cast_qualified_name],
    [$._expression_simple_name, $._ambiguous_cast_qualified_name],
    [$._simple_name, $._expression_simple_name, $._ambiguous_cast_qualified_name],
    [$.parameter, $._expression_simple_name, $._ambiguous_cast_name],
    [$.parameter, $._simple_name, $._expression_simple_name, $._ambiguous_cast_name],
    [$._expression_simple_name, $._ambiguous_cast_name],
    [$._simple_name, $._expression_simple_name, $._ambiguous_cast_name],
    [$._simple_name, $.generic_name, $._expression_generic_name, $._pattern_simple_identifier_name],
    [$._expression_simple_name, $.generic_name, $._expression_generic_name, $._pattern_simple_identifier_name],
    [
      $._simple_name,
      $._expression_simple_name,
      $.generic_name,
      $._expression_generic_name,
      $._pattern_simple_identifier_name,
    ],
    [$._expression_simple_name, $._pattern_simple_identifier_name],
    [$._simple_name, $._expression_simple_name, $._pattern_simple_identifier_name],
    [$.generic_name, $._expression_generic_name, $._pattern_simple_identifier_name],
    [$._simple_name, $.generic_name, $._expression_generic_name],
    [$._expression_simple_name, $._expression_generic_name],
    [$._simple_name, $._expression_simple_name, $.generic_name, $._expression_generic_name],
    [$._expression_simple_name, $.subpattern],
    [$._expression_simple_name, $.parameter],
    [$._simple_name, $._expression_simple_name, $.parameter],

    [$.type_argument_list, $._expression_type_argument_list],
    [$._definite_expression_argument_type, $.type],
    [$._definite_expression_pointer_type, $._pointer_base_type],
    [$._name, $._nongeneric_expression_argument_type],
    [$._name, $._other_expression_pointer_type],
    [$._nongeneric_expression_argument_type, $.type],
    [$._other_expression_pointer_type, $._pointer_base_type],
    [$._simple_name, $._nongeneric_expression_argument_type],
    [$._simple_name, $._nongeneric_expression_qualified_name],
    [$._simple_name, $._other_expression_pointer_type],
    [$.type_argument_list, $._method_expression_arguments],
    [$._ambiguous_expression_arguments, $._method_expression_arguments],
    [$._primary_no_conditional_access_expression, $._range_cast_type, $._definite_cast_name],
    [$._name, $._primary_no_conditional_access_expression, $._range_cast_type, $._definite_cast_name],
    [$._simple_name, $._expression_simple_name],
    [$.generic_name, $._expression_simple_name, $._expression_generic_name],
    [$.list_pattern],
    [$._conditional_binding_receiver, $._binding_generic_suppression_expression],
    [$._member_conditional_binding_receiver, $._member_binding_generic_suppression_expression],
    [$._binding_invocation_expression, $._binding_generic_suppression_expression],
    [$._member_binding_invocation_expression, $._member_binding_generic_suppression_expression],
    [$._simple_name, $._generic_alias_qualified_name],
    [$._simple_name, $._generic_invocation_simple_name],
    [$._pattern_declaration_type, $._assignment_target_await_expression, $.await_expression],
    [$.recursive_pattern],
    [$.type, $._pattern_type, $.recursive_pattern],
    [$.implicit_type, $._pattern_identifier, $.var_pattern, $._reserved_identifier],
    [$._pattern_primary_expression, $._pattern_non_name_primary_expression],
    [$._pattern_type, $._pattern_array_type],
    [$._pattern_type, $.recursive_pattern],
    [$._pattern_type, $._pattern_array_type, $._array_base_type],
    [$._pattern_identifier, $.var_pattern, $._reserved_identifier],
    [
      $._pattern_primary_expression,
      $._pattern_non_name_primary_expression,
      $._primary_no_conditional_access_expression,
    ],
    [
      $._pattern_primary_expression,
      $._primary_no_conditional_access_expression,
      $.conditional_access_expression,
      $._conditional_assignment_expression,
    ],
    [$._pattern_primary_expression, $.conditional_access_expression, $._conditional_assignment_expression],
    [
      $._primary_no_conditional_access_expression,
      $.conditional_access_expression,
      $._conditional_assignment_expression,
    ],
    [$._pattern_array_type, $._array_base_type],
    [$._definite_cast_type, $._range_cast_type],
    [$.type, $._definite_cast_type, $._range_cast_type],
    [$._pattern_type, $._definite_cast_type, $._range_cast_type],
    [$.array_rank_specifier, $._omitted_array_rank_specifier],
    [$._pattern_parenthesized_expression, $.constant_pattern, $.expression],
    [$._pattern_parenthesized_expression, $.constant_pattern],
    [$._simple_name, $._definite_cast_qualified_name],
    [$.positional_pattern_clause, $._untyped_positional_pattern_clause],
    [$._parenthesized_pattern_with_designation, $.subpattern],
    [$._pattern_type, $._definite_cast_type],
    [$.type, $._definite_cast_type],
    [$._simple_name, $._definite_cast_name],
    [$._name, $._definite_cast_name],
    [$._object_initializer_expression, $.initializer_expression],
    [
      $._pattern_primary_expression,
      $._primary_no_conditional_access_expression,
      $._definite_conditional_access_receiver,
    ],
    [$._pattern_primary_expression, $._definite_conditional_access_receiver],
    [$._primary_no_conditional_access_expression, $._definite_conditional_access_receiver],
    [$._pattern_unary_expression, $._nonconditional_unary_expression],
    [$._pattern_primary_expression, $._nonconditional_unary_expression],
    [$._pattern_primary_expression, $._primary_no_conditional_access_expression, $._conditional_access_receiver],
    [$.parameter, $._pattern_non_name_primary_expression, $._primary_no_conditional_access_expression],
    [$._named_subpattern, $.subpattern],
    [$.parameter_list, $._untyped_positional_pattern_clause],
    [$.pattern, $._nonconstant_pattern],
    [$.attribute, $._pattern_type],
    [$.type, $._pattern_type],
    [$.type, $._pattern_declaration_type],
    [$._pattern_type, $._pattern_declaration_type],
    [$._pattern_type, $.nullable_type],
    [$._pattern_type, $._pattern_nullable_type, $.nullable_type],
    [$._pattern_type, $._pattern_nullable_type],
    [$._pattern_nullable_type, $.nullable_type],
    [$._pattern_type, $._pointer_base_type],
    [$._pattern_member_access_expression, $._pattern_generic_member_expression],
    [$._simple_name, $._pattern_simple_generic_name],
    [$._simple_name, $._pattern_simple_identifier_name],
    [$._pattern_unary_expression, $._unary_expression],
    [$._pattern_primary_expression, $._primary_expression],
    [$._pattern_primary_expression, $._primary_no_conditional_access_expression],
    [$._pattern_identifier, $.from_clause, $._reserved_identifier],
    [$.scoped_type, $._pattern_identifier, $._reserved_identifier],
    [$._pattern_identifier, $._lambda_expression_init, $.anonymous_method_expression, $._reserved_identifier],
    [$._pattern_identifier, $.identifier],
    [$.implicit_type, $._pattern_identifier, $._reserved_identifier],
    [$._pattern_primary_expression, $._conditional_access_receiver],
    [$._pattern_non_name_primary_expression, $._primary_no_conditional_access_expression],
    [$._pattern_identifier, $._reserved_identifier],
    [$.var_pattern, $._reserved_identifier],
    [$.anonymous_method_expression, $._reserved_identifier],
    [$.attribute, $.type, $.recursive_pattern],
    [$._initialized_stackalloc_expression, $.stackalloc_expression],
    [$._member_conditional_binding_expression, $._member_conditional_binding_receiver],
    [$.array_creation_expression, $._initialized_array_creation_expression],
    [$.type, $.array_creation_expression, $._initialized_array_creation_expression],
    [$._name, $._primary_no_conditional_access_expression, $._conditional_access_receiver],
    [$._primary_no_conditional_access_expression, $._conditional_access_receiver],
    [$._name, $._conditional_access_receiver],
    [$.constant_pattern, $._nonconditional_unary_expression],
    [$._unary_expression, $._nonconditional_unary_expression],
    [$._primary_expression, $._nonconditional_unary_expression],
    [$.constant_pattern, $._primary_no_conditional_access_expression],
    [$._name, $.constant_pattern, $._primary_no_conditional_access_expression],
    [$._conditional_binding_expression, $._conditional_binding_receiver],
    [$.parameter, $._primary_no_conditional_access_expression],
    [$._primary_expression, $.conditional_access_expression],
    [$._name, $._primary_no_conditional_access_expression],
    [$.constant_pattern, $._primary_expression],
    [$._name, $.constant_pattern, $._primary_expression],
    [$.parameter, $._primary_expression],
    [$._unary_expression, $.conditional_access_expression],
    [$._name, $._primary_expression],
    [$.constant_pattern, $._unary_expression],
    [$.constant_pattern, $.expression],
    [$.tuple_element, $.declaration_expression],
    [$.nullable_type, $.array_creation_expression],
    [$._array_base_type, $.array_creation_expression],
    [$.modifier, $.anonymous_method_expression, $._reserved_identifier],
    [$.modifier, $.anonymous_method_expression],
    [$.modifier, $._constructor_declaration_initializer, $._reserved_identifier],
    [$._simple_name, $.generic_name],
    [$._simple_name, $.type_parameter],
    [$.tuple_element, $.type_pattern],
    [$.type_pattern, $.declaration_pattern],
    [$.tuple_element, $.using_variable_declarator],
    [$.tuple_pattern, $.parameter],
    [$.variable_declaration, $.type],
    [$.tuple_pattern, $._simple_name],
    [$.type, $.attribute],
    [$.type, $.nullable_type],
    [$.type, $.nullable_type, $.array_creation_expression],
    [$.type, $._array_base_type],
    [$.type, $._array_base_type, $.array_creation_expression],
    [$.type, $.array_creation_expression],
    [$.type, $._pointer_base_type],
    [$.qualified_name, $.explicit_interface_specifier],
    [$._array_base_type, $.stackalloc_expression],
    [$.constant_pattern, $._expression_statement_expression],
    [$.constant_pattern, $._name],
    [$.type, $._name_invocation_pattern, $.recursive_pattern],
    [$.type, $.recursive_pattern],
    [$.attribute, $.type, $._name_invocation_pattern, $.recursive_pattern],
    [$.parenthesized_pattern, $._parenthesized_pattern_with_designation],
    [$.expression_element, $.argument],
    [$.spread_element, $.range_expression],
    [$.collection_expression, $.list_pattern],
    [$._reserved_identifier, $.modifier],
    [$._reserved_identifier],
    [$._lambda_expression_init, $.anonymous_method_expression, $._reserved_identifier],
    [$._lambda_expression_init, $._reserved_identifier],
    [$.modifier, $._lambda_expression_init, $.anonymous_method_expression],
    [$.modifier, $._lambda_expression_init],
    [$.modifier, $._lambda_expression_init, $._reserved_identifier],
    [$.modifier, $._lambda_expression_init, $.anonymous_method_expression, $._reserved_identifier],
    [$._reserved_identifier, $.scoped_type],
    [$._reserved_identifier, $.implicit_type],
    [$._reserved_identifier, $.from_clause],
    [$._reserved_identifier, $.implicit_type, $.var_pattern],
    [$._reserved_identifier, $.type_parameter_constraint],
    [$._reserved_identifier, $.parameter, $.scoped_type],
    [$._reserved_identifier, $.parameter],
    [$._simple_name, $.parameter],
    [$.tuple_element, $.parameter, $.declaration_expression],
    [$.parameter, $.declaration_expression],
    [$.parameter, $.tuple_element],
    [$.event_declaration, $.variable_declarator],
    [$.using_directive, $.modifier],
    [$.using_directive],
    [$._constructor_declaration_initializer, $._simple_name],
    [$.receiver_parameter, $.scoped_type, $._reserved_identifier],
    [$._base_list_type, $._conditional_base_list_head, $._base_list_prefix],
    [$._base_list_type, $._base_list_prefix],
    [$._base_list_separator_path, $._base_list_suffix],
    [sym('preproc_if_in_base_list'), sym('preproc_if_in_base_list_suffix')],
    [sym('preproc_elif_in_base_list'), sym('preproc_elif_in_base_list_suffix')],
    [sym('preproc_else_in_base_list'), sym('preproc_else_in_base_list_suffix')],
    [sym('preproc_if_in_empty_base'), sym('preproc_if_in_base_list_prefix'), sym('preproc_if_in_base_list_suffix')],
    [
      sym('preproc_elif_in_empty_base'),
      sym('preproc_elif_in_base_list_prefix'),
      sym('preproc_elif_in_base_list_suffix'),
    ],
    [
      sym('preproc_else_in_empty_base'),
      sym('preproc_else_in_base_list_prefix'),
      sym('preproc_else_in_base_list_suffix'),
    ],
    [sym('preproc_if_in_empty_base'), sym('preproc_if_in_base_list_prefix')],
    [sym('preproc_elif_in_empty_base'), sym('preproc_elif_in_base_list_prefix')],
    [sym('preproc_else_in_empty_base'), sym('preproc_else_in_base_list_prefix')],
    [sym('preproc_if_in_empty_base'), sym('preproc_if_in_base_list_suffix')],
    [sym('preproc_elif_in_empty_base'), sym('preproc_elif_in_base_list_suffix')],
    [sym('preproc_else_in_empty_base'), sym('preproc_else_in_base_list_suffix')],
    [sym('preproc_if_in_base_list_prefix'), sym('preproc_if_in_base_list_suffix')],
    [sym('preproc_elif_in_base_list_prefix'), sym('preproc_elif_in_base_list_suffix')],
    [sym('preproc_else_in_base_list_prefix'), sym('preproc_else_in_base_list_suffix')],
  ],

  externals: () => [
    sym('_optional_semi'),
    sym('interpolation_regular_start'),
    sym('interpolation_verbatim_start'),
    sym('interpolation_raw_start'),
    sym('interpolation_start_quote'),
    sym('interpolation_end_quote'),
    sym('interpolation_open_brace'),
    sym('interpolation_close_brace'),
    sym('interpolation_string_content'),
    sym('raw_string_start'),
    sym('raw_string_end'),
    sym('raw_string_content'),
    // C# 14: emitted by the scanner at '(' when forward-scanning shows a
    // simple-lambda parameter list (at least one element has a parameter
    // modifier) closed by ')=>'.
    sym('_lambda_paren_open'),
    sym('_end_of_input'),
    sym('_directive_newline'),
    sym('_file_directive_preproc_arg'),
    sym('_file_directive_sdk'),
    sym('_file_directive_package'),
    sym('_file_directive_property'),
    sym('_file_directive_project'),
    sym('_file_directive_ref'),
    sym('_file_directive_include'),
    sym('_file_directive_exclude'),
    sym('file_directive_kind'),
    sym('_file_directive_literal_context'),
    sym('_file_directive_newline'),
    sym('_question_unknown'),
    sym('_question_ternary'),
    sym('_question_member_access'),
    sym('_question_element_access'),
    sym('_question_nullable'),
    sym('_case_label_colon'),
    sym('_type_context_is'),
    sym('_type_context_as'),
    sym('_question_definite_access'),
    sym('_object_index_start'),
    sym('_slice_pattern_start'),
    sym('_ambiguous_cast_operand_start'),
    sym('_ambiguous_cast_type_end'),
    sym('_definite_cast_type_end'),
    sym('_range_cast_type_end'),
    sym('_nonprimary_expression_end'),
    sym('_pattern_paren_end'),
    sym('_pattern_bracket_end'),
    sym('_bang_operator'),
    sym('_conditional_alternative_start'),
    sym('_statement_end'),
    sym('_block_end'),
    sym('_ampersand_operator'),
    sym('_interpolation_format_colon'),
    sym('_pragma_boundary'),
    sym('_pragma_text'),
    sym('_expression_generic_end'),
    sym('_definite_expression_generic_end'),
  ],

  extras: ($) => [
    /[\s\u0085\u00A0\u2028\u2029\uFEFF\u3000]+/,
    $.comment,
    $.preproc_region,
    $.preproc_endregion,
    $.preproc_line,
    $.preproc_pragma,
    $.preproc_nullable,
    $.preproc_error,
    $.preproc_warning,
    $.preproc_define,
    $.preproc_undef,
    $.file_directive,
  ],

  inline: ($) => [
    $._base_list,
    $._base_list_head,
    $._base_list_separator,
    $._enum_base_clause,
    $._enum_base_type,
    $._postfix_receiver,
    $._namespace_member_declaration,
    $._object_creation_type,
    $._nullable_base_type,
    $._parameter_type_with_modifiers,
    $._top_level_item_no_statement,
  ],

  precedences: ($) => [
    [$._anonymous_object_member_declarator, $._simple_name],
    [$._anonymous_object_member_declarator, $._expression_simple_name],
    [$.block, $.initializer_expression],
  ],

  supertypes: ($) => [
    $.declaration,
    $.expression,
    $.literal,
    $.statement,
    $.type,
    $.type_declaration,
    $.pattern,
    $._ambiguous_cast_type,
    $._definite_cast_type,
    $._range_cast_type,
    $._definite_expression_type_argument,
    $._ambiguous_expression_type_argument,
    $._other_expression_type_argument,
    $._nongeneric_expression_type_argument,
    $._method_expression_type_argument,
    $._is_pattern,
    $._nonconstant_pattern,
  ],

  word: ($) => $._identifier_token,

  rules: {
    compilation_unit: ($) => seq(optional($.shebang_directive), repeat($._top_level_item)),

    _top_level_item: ($) => prec(2, choice($._top_level_item_no_statement, $.global_statement)),

    _top_level_item_no_statement: ($) =>
      choice(
        $.extern_alias_directive,
        $.using_directive,
        $.global_attribute,
        alias(sym('preproc_if_in_top_level'), sym('preproc_if')),
        $._namespace_member_declaration,
        $.file_scoped_namespace_declaration
      ),

    global_statement: ($) => prec(1, $.statement),

    extern_alias_directive: ($) => seq('extern', 'alias', field('name', $.identifier), statementEnd()),

    using_directive: ($) =>
      seq(
        optional('global'),
        'using',
        choice(
          seq(optional('unsafe'), field('name', $.identifier), '=', $.type),
          seq(repeat(choice('static', 'unsafe')), $._name)
        ),
        statementEnd()
      ),

    global_attribute: ($) => seq('[', choice('assembly', 'module'), ':', commaSep1($.attribute), optional(','), ']'),

    attribute: ($) => seq(field('name', $._name), optional($.attribute_argument_list)),

    attribute_argument_list: ($) => prec(-1, seq('(', commaSep($.attribute_argument), ')')),

    attribute_argument: ($) =>
      prec(-1, seq(optional(prec(1, seq(field('name', $.identifier), choice(':', '=')))), $.expression)),

    attribute_list: ($) => seq('[', optional($.attribute_target_specifier), commaSep1($.attribute), optional(','), ']'),

    _attribute_list: ($) => choice($.attribute_list, sym('preproc_if_in_attribute_list')),

    // Higher precedence than `_reserved_identifier`: when both interpretations
    // are valid (e.g. `[field :` could be `_reserved_identifier` followed by
    // bogus `:`, or `attribute_target_specifier`), prefer the target-specifier
    // reading. `_reserved_identifier` still wins when no `:` follows, so
    // `[field]` continues to parse as collection_expression with identifier.
    attribute_target_specifier: () =>
      prec(1, seq(choice('field', 'event', 'method', 'param', 'property', 'return', 'type', 'typevar'), ':')),

    _namespace_member_declaration: ($) => choice($.namespace_declaration, $.type_declaration),

    namespace_declaration: ($) =>
      seq(
        'namespace',
        field('name', $._name),
        field('body', alias($._namespace_body, $.declaration_list)),
        sym('_optional_semi')
      ),

    _namespace_body: ($) => seq('{', repeat($._namespace_body_item), blockEnd()),

    _namespace_body_item: ($) =>
      prec(
        1,
        choice($.extern_alias_directive, $.declaration, alias(sym('preproc_if_in_namespace'), sym('preproc_if')))
      ),

    file_scoped_namespace_declaration: ($) =>
      prec.right(seq('namespace', field('name', $._name), statementEnd(), repeat($._top_level_item_no_statement))),

    type_declaration: ($) =>
      choice(
        $.class_declaration,
        $.struct_declaration,
        $.enum_declaration,
        $.interface_declaration,
        $.delegate_declaration,
        $.record_declaration
      ),

    class_declaration: ($) => seq($._class_declaration_initializer, $._declaration_list_body),

    _class_declaration_initializer: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        'class',
        field('name', $.identifier),
        optional($.type_parameter_list),
        optional($.parameter_list),
        optional($._base_list),
        repeat($.type_parameter_constraints_clause)
      ),

    struct_declaration: ($) => seq($._struct_declaration_initializer, $._declaration_list_body),

    _struct_declaration_initializer: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        optional(seq('ref', optional(alias('partial', $.modifier)))),
        'struct',
        field('name', $.identifier),
        optional($.type_parameter_list),
        optional($.parameter_list),
        optional($._base_list),
        repeat($.type_parameter_constraints_clause)
      ),

    enum_declaration: ($) =>
      seq(
        $._enum_declaration_initializer,
        choice(seq(field('body', $.enum_member_declaration_list), sym('_optional_semi')), statementEnd())
      ),

    _enum_declaration_initializer: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        'enum',
        field('name', $.identifier),
        optional($._enum_base_clause)
      ),

    enum_member_declaration_list: ($) =>
      seq(
        '{',
        commaSep(
          choice($.enum_member_declaration, alias(sym('preproc_if_in_enum_member_declaration'), sym('preproc_if')))
        ),
        optional(','),
        '}'
      ),

    enum_member_declaration: ($) =>
      seq(repeat($._attribute_list), field('name', $.identifier), optional(seq('=', field('value', $.expression)))),

    interface_declaration: ($) => seq($._interface_declaration_initializer, $._declaration_list_body),

    _interface_declaration_initializer: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        'interface',
        field('name', $.identifier),
        field('type_parameters', optional($.type_parameter_list)),
        optional($._base_list),
        repeat($.type_parameter_constraints_clause)
      ),

    delegate_declaration: ($) =>
      seq($._delegate_declaration_initializer, repeat($.type_parameter_constraints_clause), statementEnd()),

    _delegate_declaration_initializer: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        'delegate',
        field('type', $.type),
        field('name', $.identifier),
        field('type_parameters', optional($.type_parameter_list)),
        field('parameters', $.parameter_list)
      ),

    record_declaration: ($) => seq($._record_declaration_initializer, $._declaration_list_body),

    _record_declaration_initializer: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        'record',
        optional(choice('class', 'struct')),
        field('name', $.identifier),
        optional($.type_parameter_list),
        optional($.parameter_list),
        optional($._base_list),
        repeat($.type_parameter_constraints_clause)
      ),

    _declaration_list_body: ($) =>
      choice(seq(field('body', $.declaration_list), sym('_optional_semi')), statementEnd()),

    modifier: () =>
      prec.right(
        choice(
          'abstract',
          'async',
          'const',
          'extern',
          'file',
          'fixed',
          'internal',
          'new',
          'override',
          'partial',
          'private',
          'protected',
          'public',
          'readonly',
          'required',
          // 'ref',     // `ref` as a modifier can only be used on struct declarations. Other than that it's a ref type or a ref parameter in a declaration.
          // 'scoped',  // `scoped` is either part of a scoped type or a scoped parameter. Both of which are handled outside of `modifier`.
          'sealed',
          'static',
          'unsafe',
          'virtual',
          'volatile'
        )
      ),

    type_parameter_list: ($) =>
      seq(
        '<',
        commaSep1($.type_parameter),
        choice('>', alias(sym('_expression_generic_end'), '>'), alias(sym('_definite_expression_generic_end'), '>'))
      ),

    type_parameter: ($) => seq(repeat($._attribute_list), optional(choice('in', 'out')), field('name', $.identifier)),

    _enum_base_clause: ($) => choice(alias($._enum_base_list, $.base_list), $._conditional_enum_base_clause),

    _conditional_enum_base_clause: ($) =>
      seq(alias(sym('preproc_if_in_enum_base_clause'), sym('preproc_if')), optional($._enum_base_clause)),

    _enum_base_list: ($) => seq(':', $._enum_base_type),

    _enum_base_type: ($) =>
      seq(
        repeat($._base_list_trivia),
        choice(field('underlying_type', $.type), $._conditional_enum_base_type),
        repeat($._base_list_trivia)
      ),

    _conditional_enum_base_type: ($) =>
      choice(
        alias(sym('preproc_if_in_enum_base_type'), sym('preproc_if')),
        seq(
          $._conditional_enum_base_type,
          repeat($._base_list_trivia),
          alias(sym('preproc_if_in_enum_base_type'), sym('preproc_if'))
        )
      ),

    _base_list_trivia: () => alias(sym('preproc_if_in_empty_base'), sym('preproc_if')),

    _base_list: ($) => choice($.base_list, $._conditional_base_list),

    _conditional_base_list: ($) =>
      seq(
        alias(sym('preproc_if_in_base_list'), sym('preproc_if')),
        optional(choice($._base_list_suffix, $._base_list))
      ),

    base_list: ($) => seq(':', $._base_list_type),

    _base_list_type: ($) =>
      choice(
        seq($._base_list_mixed_type, choice($._base_list_type, $._base_list_suffix)),
        seq(alias(sym('preproc_if_in_base_list_prefix'), sym('preproc_if')), $._base_list_type),
        seq($._base_list_head, optional($._base_list_suffix))
      ),

    _base_list_head: ($) =>
      choice(seq(field('base', $.type), optional($.argument_list)), $._conditional_base_list_head),

    _conditional_base_list_head: ($) =>
      choice(
        alias(sym('preproc_if_in_base_list_type'), sym('preproc_if')),
        seq(
          $._conditional_base_list_head,
          repeat($._base_list_trivia),
          alias(sym('preproc_if_in_base_list_type'), sym('preproc_if'))
        )
      ),

    _base_list_mixed_type: () => alias(sym('preproc_if_in_mixed_base_type'), sym('preproc_if')),

    _base_list_mixed_suffix: () => alias(sym('preproc_if_in_mixed_base_suffix'), sym('preproc_if')),

    _base_list_prefix: ($) =>
      choice(
        seq($._base_list_mixed_type, choice($._base_list_prefix, $._base_list_separator_path)),
        seq(alias(sym('preproc_if_in_base_list_prefix'), sym('preproc_if')), optional($._base_list_prefix)),
        seq($._base_list_head, $._base_list_separator_path)
      ),

    _base_list_separator: () => choice(',', alias(sym('preproc_if_in_base_list_separator'), sym('preproc_if'))),

    _base_list_separator_path: ($) =>
      choice(
        seq($._base_list_mixed_suffix, choice($._base_list_prefix, $._base_list_separator_path)),
        seq(alias(sym('preproc_if_in_base_list_suffix'), sym('preproc_if')), $._base_list_separator_path),
        seq($._base_list_separator, optional($._base_list_prefix))
      ),

    _base_list_suffix: ($) =>
      choice(
        seq($._base_list_mixed_suffix, choice($._base_list_type, $._base_list_suffix)),
        seq(alias(sym('preproc_if_in_base_list_suffix'), sym('preproc_if')), optional($._base_list_suffix)),
        seq($._base_list_separator, $._base_list_type)
      ),

    type_parameter_constraints_clause: ($) => seq('where', $.identifier, ':', commaSep1($.type_parameter_constraint)),

    type_parameter_constraint: ($) =>
      choice(
        seq('class', optional(nullableQuestion())),
        'struct',
        'notnull',
        'unmanaged',
        seq('allows', 'ref', 'struct'),
        $.constructor_constraint,
        field('type', $.type)
      ),

    constructor_constraint: () => seq('new', '(', ')'),

    operator_declaration: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        field('type', $.type),
        optional($.explicit_interface_specifier),
        'operator',
        optional('checked'),
        field(
          'operator',
          choice(
            bangOperator(),
            '~',
            '++',
            '--',
            'true',
            'false',
            '+',
            '-',
            '*',
            '/',
            '%',
            '^',
            '|',
            ampersandOperator(),
            '<<',
            '>>',
            '>>>',
            '==',
            '!=',
            '>',
            '<',
            '>=',
            '<=',
            '+=',
            '-=',
            '*=',
            '/=',
            '%=',
            '^=',
            '|=',
            '&=',
            '<<=',
            '>>=',
            '>>>='
          )
        ),
        field('parameters', $.parameter_list),
        $._function_body
      ),

    conversion_operator_declaration: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        choice('implicit', 'explicit'),
        repeat1(choice($.explicit_interface_specifier, 'operator', 'checked')),
        field('type', $.type),
        field('parameters', $.parameter_list),
        $._function_body
      ),

    declaration_list: ($) => seq('{', repeat($.declaration), blockEnd()),

    declaration: ($) =>
      choice(
        $.class_declaration,
        $.struct_declaration,
        $.enum_declaration,
        $.delegate_declaration,
        $.field_declaration,
        $.method_declaration,
        $.conditional_method_declaration,
        $.event_declaration,
        $.event_field_declaration,
        $.record_declaration,
        $.constructor_declaration,
        $.destructor_declaration,
        $.indexer_declaration,
        $.interface_declaration,
        $.namespace_declaration,
        $.operator_declaration,
        $.conversion_operator_declaration,
        $.property_declaration,
        $.using_directive,
        sym('preproc_if'),
        $.extension_declaration
      ),

    // C# 14: extension declarations introduce extension methods, properties,
    // and operators with a shared receiver inside a non-generic static class.
    // https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/proposals/csharp-14.0/extensions
    //
    // `extension` is contextual; it is recognized as the start of an
    // extension declaration when followed by `<` or `(` in declaration
    // position. Use prec.dynamic so an identifier named `extension` in
    // other positions still parses.
    extension_declaration: ($) =>
      prec.dynamic(
        1,
        seq(
          repeat($._attribute_list),
          'extension',
          optional($.type_parameter_list),
          '(',
          $.receiver_parameter,
          ')',
          repeat($.type_parameter_constraints_clause),
          $.extension_body
        )
      ),

    // The precedence reads the `ref` of `extension(ref int)` as a modifier rather than a ref_type.
    receiver_parameter: ($) =>
      prec(1, seq(repeat($._attribute_list), $._parameter_type_with_modifiers, optional(field('name', $.identifier)))),

    extension_body: ($) => seq('{', repeat($._extension_member_declaration), '}', optional(statementEnd())),

    _extension_member_declaration: ($) =>
      choice($.method_declaration, $.conditional_method_declaration, $.property_declaration, $.operator_declaration),

    field_declaration: ($) =>
      seq(repeat($._attribute_list), repeat($.modifier), $.variable_declaration, statementEnd()),

    constructor_declaration: ($) => seq($._constructor_declaration_initializer, $._function_body),

    _constructor_declaration_initializer: ($) =>
      seq(
        repeat($._attribute_list),
        choice(
          repeat($.modifier),
          prec.dynamic(1, seq(repeat($.modifier), alias('partial', $.modifier), repeat($.modifier)))
        ),
        field('name', $.identifier),
        field('parameters', $.parameter_list),
        optional($.constructor_initializer)
      ),

    destructor_declaration: ($) =>
      seq(
        repeat($._attribute_list),
        optional('extern'),
        '~',
        field('name', $.identifier),
        field('parameters', $.parameter_list),
        $._function_body
      ),

    method_declaration: ($) => seq($._method_signature, $._function_body),

    conditional_method_declaration: ($) =>
      seq(alias(sym('preproc_if_in_method_signature'), sym('preproc_if')), $._function_body),

    method_signature: ($) => $._method_signature,

    _method_signature: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        field('returns', $.type),
        optional($.explicit_interface_specifier),
        field('name', $.identifier),
        field('type_parameters', optional($.type_parameter_list)),
        field('parameters', $.parameter_list),
        repeat($.type_parameter_constraints_clause)
      ),

    event_declaration: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        'event',
        field('type', $.type),
        optional($.explicit_interface_specifier),
        field('name', $.identifier),
        choice(field('accessors', $.accessor_list), statementEnd())
      ),

    event_field_declaration: ($) =>
      prec.dynamic(
        1,
        seq(repeat($._attribute_list), repeat($.modifier), 'event', $.variable_declaration, statementEnd())
      ),

    accessor_list: ($) => seq('{', repeat($.accessor_declaration), '}'),

    accessor_declaration: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        field('name', choice('get', 'set', 'add', 'remove', 'init', $.identifier)),
        $._function_body
      ),

    indexer_declaration: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        field('type', $.type),
        optional($.explicit_interface_specifier),
        'this',
        field('parameters', $.bracketed_parameter_list),
        choice(field('accessors', $.accessor_list), seq(field('value', $.arrow_expression_clause), statementEnd()))
      ),

    bracketed_parameter_list: ($) => seq('[', sep(choice($.parameter, $._parameter_array), ','), ']'),

    property_declaration: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        field('type', $.type),
        optional($.explicit_interface_specifier),
        field('name', $.identifier),
        choice(
          seq(field('accessors', $.accessor_list), optional(seq('=', field('value', $.expression), statementEnd()))),
          seq(field('value', $.arrow_expression_clause), statementEnd())
        )
      ),

    explicit_interface_specifier: ($) => prec(PREC.DOT, seq($._name, '.')),

    parameter_list: ($) => seq('(', sep(choice($.parameter, $._parameter_array), ','), ')'),

    // `ref`, `out`, and `in` stay out of the repeat: reducing the repeat after them would compete with the shift of
    // the next token into an argument (`(ref x)`), whose precedence wins, so `(ref int i) =>` would read `ref int` as a
    // ref_type while a method's `(ref int i)` reads `ref` as a modifier.
    _parameter_type_with_modifiers: ($) =>
      seq(
        repeat(prec.left(alias(choice('this', 'scoped', 'readonly'), $.modifier))),
        optional(
          seq(
            alias(choice('ref', 'out', 'in'), $.modifier),
            repeat(prec.left(alias(choice('this', 'readonly'), $.modifier)))
          )
        ),
        field('type', $.type)
      ),

    parameter: ($) =>
      seq(
        repeat($._attribute_list),
        optional($._parameter_type_with_modifiers),
        field('name', $.identifier),
        optional(seq('=', $.expression))
      ),

    _parameter_array: ($) =>
      seq(repeat($._attribute_list), 'params', field('type', $.type), field('name', $.identifier)),

    constructor_initializer: ($) => seq(':', choice('base', 'this'), $.argument_list),

    argument_list: ($) => seq('(', commaSep($.argument), ')'),

    tuple_pattern: ($) => seq('(', commaSep1(choice(field('name', $.identifier), $.discard, $.tuple_pattern)), ')'),

    argument: ($) =>
      prec(
        1,
        seq(
          optional(seq(field('name', $.identifier), ':')),
          choice(seq(optional(choice('ref', 'out', 'in')), $.expression), seq('out', $.declaration_expression))
        )
      ),

    block: ($) => seq('{', repeat($.statement), blockEnd()),

    arrow_expression_clause: ($) => seq('=>', $.expression),

    _function_body: ($) =>
      choice(field('body', $.block), seq(field('body', $.arrow_expression_clause), statementEnd()), statementEnd()),

    variable_declaration: ($) =>
      choice(
        seq(field('type', $.type), commaSep1($.variable_declarator)),
        seq(field('type', $.implicit_type), alias($._deconstruction_declarator, $.variable_declarator))
      ),

    _deconstruction_declarator: ($) =>
      prec.dynamic(1, seq(alias($._deconstruction_tuple_pattern, $.tuple_pattern), '=', $.expression)),

    _deconstruction_tuple_pattern: ($) =>
      seq('(', commaSep2(choice(field('name', $.identifier), $.discard, $.tuple_pattern)), ')'),

    using_variable_declaration: ($) =>
      seq(field('type', $.type), commaSep1(alias($.using_variable_declarator, $.variable_declarator))),

    variable_declarator: ($) =>
      seq(field('name', $.identifier), optional($.bracketed_argument_list), optional(seq('=', $.expression))),

    using_variable_declarator: ($) => seq(field('name', $.identifier), optional(seq('=', $.expression))),

    bracketed_argument_list: ($) => bracketedArgumentList($, '['),

    qualified_identifier: ($) => sep1($.identifier, '.'),

    _name: ($) => choice($.alias_qualified_name, $.qualified_name, $._simple_name),

    alias_qualified_name: ($) => seq(field('alias', $.identifier), '::', field('name', $._simple_name)),

    _simple_name: ($) => choice($.identifier, $.generic_name),

    qualified_name: ($) => prec(PREC.DOT, seq(field('qualifier', $._name), '.', field('name', $._simple_name))),

    generic_name: ($) => prec.dynamic(1, seq($.identifier, $.type_argument_list)),

    type_argument_list: ($) =>
      seq(
        '<',
        choice(repeat(','), commaSep1($.type)),
        choice('>', alias(sym('_expression_generic_end'), '>'), alias(sym('_definite_expression_generic_end'), '>'))
      ),

    _expression_simple_name: ($) => choice($.identifier, alias($._expression_generic_name, $.generic_name)),

    _expression_generic_name: ($) =>
      prec.dynamic(1, seq($.identifier, alias($._expression_type_argument_list, $.type_argument_list))),

    _expression_type_argument_list: ($) =>
      seq(
        '<',
        choice(
          seq(choice(repeat(','), commaSep1($.type)), alias(sym('_expression_generic_end'), '>')),
          seq(repeat(','), alias(sym('_definite_expression_generic_end'), '>')),
          seq(
            repeat(seq(alias($._other_expression_type_argument, $.type), ',')),
            choice(
              alias($._definite_expression_type_argument, $.type),
              seq(alias($._ambiguous_expression_type_argument, $.type), ',', $.type)
            ),
            repeat(seq(',', $.type)),
            alias(sym('_definite_expression_generic_end'), '>')
          )
        )
      ),

    _definite_expression_type_argument: ($) => $._definite_expression_argument_type,

    _ambiguous_expression_type_argument: ($) => $._ambiguous_expression_argument_type,

    _other_expression_type_argument: ($) => $._other_expression_argument_type,

    _nongeneric_expression_type_argument: ($) => $._nongeneric_expression_argument_type,

    _method_expression_type_argument: ($) => $._method_expression_argument_type,

    _definite_expression_argument_type: ($) =>
      choice(
        $.predefined_type,
        $.nullable_type,
        $.function_pointer_type,
        alias($._omitted_cast_array_type, $.array_type),
        alias($._definite_expression_pointer_type, $.pointer_type)
      ),

    _definite_expression_pointer_type: ($) =>
      seq(
        field(
          'type',
          choice(
            $.predefined_type,
            $.nullable_type,
            $.function_pointer_type,
            alias($._definite_expression_pointer_type, $.pointer_type),
            alias($._method_expression_generic_name, $.generic_name),
            alias($._method_expression_qualified_name, $.qualified_name)
          )
        ),
        '*'
      ),

    _ambiguous_expression_argument_type: ($) =>
      choice(
        alias($._ambiguous_expression_generic_name, $.generic_name),
        alias($._ambiguous_expression_qualified_name, $.qualified_name)
      ),

    _ambiguous_expression_generic_name: ($) =>
      prec.dynamic(1, seq($.identifier, alias($._ambiguous_expression_arguments, $.type_argument_list))),

    _ambiguous_expression_arguments: ($) =>
      seq(
        '<',
        commaSep1(alias($._nongeneric_expression_type_argument, $.type)),
        choice('>', alias(sym('_expression_generic_end'), '>'), alias(sym('_definite_expression_generic_end'), '>'))
      ),

    _ambiguous_expression_qualified_name: ($) =>
      seq(field('qualifier', $._name), '.', field('name', alias($._ambiguous_expression_generic_name, $.generic_name))),

    _other_expression_argument_type: ($) =>
      choice($._nongeneric_expression_argument_type, $._method_expression_argument_type),

    _nongeneric_expression_argument_type: ($) =>
      choice(
        $.identifier,
        alias($._nongeneric_expression_qualified_name, $.qualified_name),
        $.alias_qualified_name,
        $.tuple_type,
        alias($._other_expression_pointer_type, $.pointer_type)
      ),

    _method_expression_argument_type: ($) =>
      choice(
        alias($._method_expression_generic_name, $.generic_name),
        alias($._method_expression_qualified_name, $.qualified_name)
      ),

    _nongeneric_expression_qualified_name: ($) => seq(field('qualifier', $._name), '.', field('name', $.identifier)),

    _method_expression_generic_name: ($) =>
      prec.dynamic(1, seq($.identifier, alias($._method_expression_arguments, $.type_argument_list))),

    _method_expression_arguments: ($) =>
      seq(
        '<',
        choice(
          repeat(','),
          seq(
            repeat(seq(alias($._nongeneric_expression_type_argument, $.type), ',')),
            choice(
              alias($._definite_expression_type_argument, $.type),
              alias($._ambiguous_expression_type_argument, $.type),
              alias($._method_expression_type_argument, $.type)
            ),
            repeat(seq(',', $.type))
          )
        ),
        choice('>', alias(sym('_expression_generic_end'), '>'), alias(sym('_definite_expression_generic_end'), '>'))
      ),

    _method_expression_qualified_name: ($) =>
      seq(field('qualifier', $._name), '.', field('name', alias($._method_expression_generic_name, $.generic_name))),

    _other_expression_pointer_type: ($) =>
      seq(
        field(
          'type',
          choice(
            $.identifier,
            alias($._nongeneric_expression_qualified_name, $.qualified_name),
            $.alias_qualified_name,
            $.tuple_type,
            $._ambiguous_expression_argument_type,
            alias($._other_expression_pointer_type, $.pointer_type)
          )
        ),
        '*'
      ),

    type: ($) => typeAlternatives($),

    _pattern_type: ($) =>
      choice(
        prec.dynamic(2, alias($._pattern_array_type, $.array_type)),
        $._name,
        alias($._pattern_nullable_type, $.nullable_type),
        $.function_pointer_type,
        $.predefined_type,
        $.ref_type,
        $.scoped_type
      ),

    _pattern_array_type: ($) =>
      seq(
        field(
          'type',
          choice(
            alias($._pattern_array_type, $.array_type),
            $._name,
            alias($._pattern_nullable_type, $.nullable_type),
            $.pointer_type,
            $.function_pointer_type,
            $.predefined_type,
            $.tuple_type
          )
        ),
        field('rank', $.array_rank_specifier)
      ),

    _pattern_nullable_type: ($) =>
      seq(
        field('type', choice(alias($._pattern_array_type, $.array_type), $._name, $.predefined_type)),
        nullableQuestion()
      ),

    _pattern_declaration_type: ($) =>
      choice(
        $.implicit_type,
        prec(PREC.UNARY, alias('await', $.identifier)),
        alias($._pattern_array_type, $.array_type),
        $._name,
        alias($._pattern_nullable_type, $.nullable_type),
        $.function_pointer_type,
        $.predefined_type,
        $.ref_type,
        $.scoped_type
      ),

    implicit_type: () => prec.dynamic(1, 'var'),

    array_type: ($) => seq(field('type', $._array_base_type), field('rank', $.array_rank_specifier)),

    _array_base_type: ($) =>
      choice(
        $.array_type,
        $._name,
        $.nullable_type,
        $.pointer_type,
        $.function_pointer_type,
        $.predefined_type,
        $.tuple_type
      ),

    array_rank_specifier: ($) => seq('[', commaSep(optional($.expression)), ']'),

    nullable_type: ($) => seq(field('type', $._nullable_base_type), nullableQuestion()),

    _nullable_base_type: ($) => choice($.array_type, $._name, $.predefined_type, $.tuple_type),

    pointer_type: ($) => seq(field('type', $._pointer_base_type), '*'),

    _pointer_base_type: ($) =>
      choice($._name, $.nullable_type, $.pointer_type, $.function_pointer_type, $.predefined_type, $.tuple_type),

    function_pointer_type: ($) =>
      seq(
        'delegate',
        '*',
        optional($.calling_convention),
        '<',
        repeat(seq($.function_pointer_parameter, ',')),
        field('returns', $.type),
        '>'
      ),

    calling_convention: ($) =>
      choice(
        'managed',
        seq(
          'unmanaged',
          optional(seq('[', commaSep1(choice('Cdecl', 'Stdcall', 'Thiscall', 'Fastcall', $.identifier)), ']'))
        )
      ),

    function_pointer_parameter: ($) => seq(optional(choice('ref', 'out', 'in')), field('type', $._ref_base_type)),

    predefined_type: () =>
      token(
        choice(
          'bool',
          'byte',
          'char',
          'decimal',
          'double',
          'float',
          'int',
          'long',
          'object',
          'sbyte',
          'short',
          'string',
          'uint',
          'ulong',
          'ushort',
          'void'
        )
      ),

    // Right-associative so that a parameter's `ref int x` keeps `ref` as a modifier instead of reducing a ref_type.
    ref_type: ($) => prec.right(seq('ref', optional('readonly'), field('type', $.type))),

    _ref_base_type: ($) =>
      choice(
        $.implicit_type,
        $._name,
        $.nullable_type,
        $.array_type,
        $.pointer_type,
        $.function_pointer_type,
        $.predefined_type,
        $.tuple_type
      ),

    scoped_type: ($) => seq('scoped', field('type', $._scoped_base_type)),

    _scoped_base_type: ($) => choice($._name, $.ref_type),

    tuple_type: ($) => seq('(', commaSep2($.tuple_element), ')'),

    tuple_element: ($) => seq(field('type', $.type), field('name', optional($.identifier))),

    statement: ($) =>
      prec(
        1,
        choice(
          $.block,
          $.break_statement,
          $.checked_statement,
          $.continue_statement,
          $.do_statement,
          $.empty_statement,
          $.expression_statement,
          $.fixed_statement,
          $.for_statement,
          $.return_statement,
          $.lock_statement,
          $.yield_statement,
          $.switch_statement,
          $.throw_statement,
          $.try_statement,
          $.unsafe_statement,
          $.using_statement,
          $.foreach_statement,
          $.goto_statement,
          $.labeled_statement,
          $.if_statement,
          $.while_statement,
          $.local_declaration_statement,
          $.local_function_statement,
          alias(sym('preproc_if_in_top_level'), sym('preproc_if'))
        )
      ),

    break_statement: () => seq('break', statementEnd()),

    checked_statement: ($) => seq(choice('checked', 'unchecked'), $.block),

    continue_statement: () => seq('continue', statementEnd()),

    do_statement: ($) =>
      seq('do', field('body', $.statement), 'while', '(', field('condition', $.expression), ')', statementEnd()),

    empty_statement: () => statementEnd(),

    expression_statement: ($) => seq($._expression_statement_expression, statementEnd()),

    fixed_statement: ($) => seq('fixed', '(', $.variable_declaration, ')', $.statement),

    for_statement: ($) => seq('for', $._for_statement_conditions, field('body', $.statement)),

    _for_statement_conditions: ($) =>
      seq(
        '(',
        field('initializer', optional(choice($.variable_declaration, commaSep1($.expression)))),
        statementEnd(),
        field('condition', optional($.expression)),
        statementEnd(),
        field('update', optional(commaSep1($.expression))),
        ')'
      ),

    return_statement: ($) => seq('return', optional($.expression), statementEnd()),

    lock_statement: ($) => seq('lock', '(', $.expression, ')', $.statement),

    yield_statement: ($) => seq('yield', choice(seq('return', $.expression), 'break'), statementEnd()),

    switch_statement: ($) =>
      seq(
        'switch',
        choice(seq('(', field('value', $.expression), ')'), field('value', $.tuple_expression)),
        field('body', $.switch_body)
      ),

    switch_body: ($) => seq('{', repeat($.switch_section), blockEnd()),

    switch_section: ($) =>
      prec.left(
        seq(
          choice(seq('case', choice($.expression, seq($.pattern, optional($.when_clause)))), 'default'),
          alias(sym('_case_label_colon'), ':'),
          repeat($.statement)
        )
      ),

    throw_statement: ($) => seq('throw', optional($.expression), statementEnd()),

    try_statement: ($) => seq('try', field('body', $.block), repeat($.catch_clause), optional($.finally_clause)),

    catch_clause: ($) =>
      seq('catch', repeat(choice($.catch_declaration, $.catch_filter_clause)), field('body', $.block)),

    catch_declaration: ($) => seq('(', field('type', $.type), optional(field('name', $.identifier)), ')'),

    catch_filter_clause: ($) => seq('when', '(', $.expression, ')'),

    finally_clause: ($) => seq('finally', $.block),

    unsafe_statement: ($) => seq('unsafe', $.block),

    using_statement: ($) =>
      seq(
        optional('await'),
        'using',
        '(',
        choice(alias($.using_variable_declaration, $.variable_declaration), $.expression),
        ')',
        field('body', $.statement)
      ),

    foreach_statement: ($) => seq($._foreach_statement_initializer, field('body', $.statement)),

    _foreach_statement_initializer: ($) =>
      seq(
        optional('await'),
        'foreach',
        '(',
        choice(
          seq(field('type', $.type), field('left', choice($.identifier, $.tuple_pattern))),
          field('left', $.expression)
        ),
        'in',
        field('right', $.expression),
        ')'
      ),

    goto_statement: ($) => seq('goto', optional(choice('case', 'default')), optional($.expression), statementEnd()),

    labeled_statement: ($) => seq($.identifier, ':', $.statement),

    if_statement: ($) =>
      prec.right(
        seq(
          'if',
          '(',
          field('condition', $.expression),
          ')',
          field('consequence', $.statement),
          optional(seq('else', field('alternative', $.statement)))
        )
      ),

    while_statement: ($) => seq('while', '(', field('condition', $.expression), ')', field('body', $.statement)),

    local_declaration_statement: ($) =>
      seq(optional('await'), optional('using'), repeat($.modifier), $.variable_declaration, statementEnd()),

    local_function_statement: ($) =>
      seq($._local_function_declaration, repeat($.type_parameter_constraints_clause), $._function_body),

    _local_function_declaration: ($) =>
      seq(
        repeat($._attribute_list),
        repeat($.modifier),
        field('type', $.type),
        field('name', $.identifier),
        field('type_parameters', optional($.type_parameter_list)),
        field('parameters', $.parameter_list)
      ),

    _is_pattern: ($) =>
      choice(
        alias($._is_constant_pattern, $.constant_pattern),
        $.declaration_pattern,
        $.discard,
        $.recursive_pattern,
        $.var_pattern,
        alias($._is_negated_pattern, $.negated_pattern),
        alias($._parenthesized_pattern_with_designation, $.recursive_pattern),
        $.parenthesized_pattern,
        $.relational_pattern,
        alias($._is_or_pattern, $.or_pattern),
        alias($._is_and_pattern, $.and_pattern),
        $.list_pattern,
        $.slice_pattern,
        $.type_pattern
      ),

    _is_constant_pattern: ($) => prec(PREC.REL, choice(...constantExpressionRoots($))),

    _is_negated_pattern: ($) => seq('not', alias($._is_pattern, $.pattern)),

    _is_or_pattern: ($) =>
      prec.dynamic(
        2,
        prec.left(
          PREC.OR,
          seq(
            field('left', alias($._is_pattern, $.pattern)),
            field('operator', 'or'),
            field('right', alias($._is_pattern, $.pattern))
          )
        )
      ),

    _is_and_pattern: ($) =>
      prec.dynamic(
        2,
        prec.left(
          PREC.AND,
          seq(
            field('left', alias($._is_pattern, $.pattern)),
            field('operator', 'and'),
            field('right', alias($._is_pattern, $.pattern))
          )
        )
      ),

    _pattern_unary_expression: ($) =>
      choice($._pattern_primary_expression, $.prefix_unary_expression, $.cast_expression),

    _pattern_parenthesized_expression: ($) =>
      seq('(', choice(...nestedConstantExpressionRoots($)), choice(')', alias(sym('_pattern_paren_end'), ')'))),

    _pattern_primary_expression: ($) =>
      choice(
        primaryAtoms($, {
          name: alias($._pattern_identifier, $.identifier),
          member: alias($._pattern_member_access_expression, $.member_access_expression),
          collection: false,
          element: alias($._pattern_element_access_expression, $.element_access_expression),
          invocation: alias($._pattern_invocation_expression, $.invocation_expression),
          tuple: false,
          parenthesized: alias($._pattern_parenthesized_expression, $.parenthesized_expression),
        }),
        $.conditional_access_expression,
        alias($._conditional_suppression_expression, $.postfix_unary_expression)
      ),

    _pattern_identifier: ($) => choice($._identifier_token, ...reservedIdentifiers().slice(1)),

    _pattern_simple_identifier_name: ($) => $.identifier,

    _pattern_simple_generic_name: ($) => $.generic_name,

    _pattern_member_access_expression: ($) =>
      choice(
        memberAccessExpression(
          $,
          choice($._primary_no_conditional_access_expression, $.predefined_type, $._name),
          $._pattern_simple_identifier_name
        ),
        memberAccessExpression(
          $,
          choice($._pattern_non_name_primary_expression, $.predefined_type),
          $._pattern_simple_generic_name,
          '.'
        ),
        memberAccessExpression(
          $,
          choice($._primary_no_conditional_access_expression, $.predefined_type, $._name),
          $._pattern_simple_generic_name,
          '->'
        )
      ),

    _pattern_non_name_primary_expression: ($) =>
      choice(
        primaryAtoms($, {
          member: alias($._pattern_non_name_member_access_expression, $.member_access_expression),
          collection: true,
          parenthesized: alias($._pattern_parenthesized_expression, $.parenthesized_expression),
        })
      ),

    _pattern_non_name_member_access_expression: ($) =>
      choice(
        memberAccessExpression(
          $,
          choice($._pattern_non_name_primary_expression, $.predefined_type),
          $._simple_name,
          '.'
        ),
        memberAccessExpression(
          $,
          choice($._primary_no_conditional_access_expression, $.predefined_type, $._name),
          $._simple_name,
          '->'
        )
      ),

    _pattern_element_access_expression: ($) => elementAccessExpression($, $._pattern_non_name_primary_expression),

    _pattern_invocation_expression: ($) => invocationExpression($, $._pattern_non_name_primary_expression),

    _nameof_expression: ($) => invocationExpression($, alias('nameof', $.identifier)),

    _pattern_generic_member_expression: ($) =>
      memberAccessExpression(
        $,
        choice($._primary_no_conditional_access_expression, $.predefined_type, $._name),
        $._pattern_simple_generic_name
      ),

    _is_arithmetic_start_expression: ($) =>
      prec(
        PREC.SHIFT,
        choice(
          ...constantExpressionRoots($),
          $.generic_name,
          $.element_access_expression,
          alias($._pattern_generic_member_expression, $.member_access_expression)
        )
      ),

    _is_arithmetic_expression: ($) =>
      prec(
        PREC.SHIFT,
        choice(
          $._unary_expression,
          alias($._is_arithmetic_operand_binary_expression, $.binary_expression),
          alias($._is_operand_range_expression, $.range_expression),
          alias($._is_operand_switch_expression, $.switch_expression),
          alias($._is_operand_with_expression, $.with_expression)
        )
      ),

    _is_constant_receiver_expression: ($) => prec(PREC.SHIFT, choice(...constantExpressionRoots($))),

    _is_range_expression: ($) => rangeExpression($._is_arithmetic_start_expression, $._is_arithmetic_expression, false),

    _is_operand_range_expression: ($) => rangeExpression($._is_arithmetic_expression, $._is_arithmetic_expression),

    _is_switch_expression: ($) => switchExpression($, $._is_constant_receiver_expression),

    _is_operand_switch_expression: ($) => switchExpression($, $._is_arithmetic_expression),

    _is_with_expression: ($) => withExpression($, $._is_constant_receiver_expression),

    _is_operand_with_expression: ($) => withExpression($, $._is_arithmetic_expression),

    _is_arithmetic_binary_expression: ($) =>
      arithmeticBinaryExpression($._is_arithmetic_start_expression, $._is_arithmetic_expression, true),

    _is_arithmetic_operand_binary_expression: ($) =>
      arithmeticBinaryExpression($._is_arithmetic_expression, $._is_arithmetic_expression),

    pattern: ($) => choice($.constant_pattern, nonconstantPatterns($)),

    _nonconstant_pattern: ($) => nonconstantPatterns($),

    // Uses '(' pattern ')' to create direct conflict with parenthesized_pattern
    _parenthesized_pattern_with_designation: ($) =>
      seq('(', $.pattern, choice(')', alias(sym('_pattern_paren_end'), ')')), $._simple_designation),

    constant_pattern: ($) => choice(...nestedConstantExpressionRoots($)),

    _name_invocation_pattern: ($) => seq(field('function', $._name), field('arguments', $.argument_list)),

    _complex_invocation_expression: ($) =>
      prec(
        PREC.INVOCATION + 1,
        seq(
          field(
            'function',
            choice(
              $.member_access_expression,
              $.element_access_expression,
              $.invocation_expression,
              $.parenthesized_expression,
              $.conditional_access_expression,
              $.cast_expression
            )
          ),
          field('arguments', $.argument_list)
        )
      ),

    discard: () => '_',

    parenthesized_pattern: ($) =>
      seq('(', alias($._nonconstant_pattern, $.pattern), choice(')', alias(sym('_pattern_paren_end'), ')'))),

    // The implicit_type reading of `var` contributes dynamic precedence 1; its parenthesized designation needs more.
    var_pattern: ($) => prec.dynamic(2, seq('var', $.parenthesized_variable_designation)),

    // No associativity: tree-sitter 0.27 resolves a precedence tie with a right-associative reduce as a shift, which
    // makes `case int when x:` and `x is A or nameof(y)` read `when` and `(y)` as a variable designation.
    // A name such as `A.B` in `R(A.B or C)` also parses as a constant pattern. Without the negative dynamic
    // precedence, the reading depends on the other GLR stack versions alive at that point, so an incremental
    // reparse can switch it without reporting a changed range.
    type_pattern: ($) => prec.dynamic(-1, field('type', $._pattern_type)),

    list_pattern: ($) =>
      seq(
        '[',
        optional(seq(commaSep1($.pattern), optional(','))),
        choice(']', alias(sym('_pattern_bracket_end'), ']')),
        optional($._simple_designation)
      ),

    slice_pattern: ($) => prec.right(seq(alias(sym('_slice_pattern_start'), '..'), optional($.pattern))),

    recursive_pattern: ($) =>
      choice(
        prec.dynamic(
          2,
          seq(
            field('type', $._name),
            $.positional_pattern_clause,
            optional($.property_pattern_clause),
            $._simple_designation
          )
        ),
        prec.dynamic(2, seq(field('type', $._name), $.positional_pattern_clause, optional($.property_pattern_clause))),
        prec.dynamic(1, seq($.positional_pattern_clause, $._simple_designation)),
        alias($._untyped_positional_pattern_clause, $.positional_pattern_clause),
        seq(
          field('type', typeAlternatives($, true, true, false)),
          $.property_pattern_clause,
          optional($._simple_designation)
        ),
        // Names already use the branch above. Admitting them again through type duplicates Name(A.B)
        // and can evict viable GLR versions during recovery.
        seq(
          field(
            'type',
            choice(
              $.predefined_type,
              $.function_pointer_type,
              prec.dynamic(1, alias($._pattern_array_type, $.array_type))
            )
          ),
          $.positional_pattern_clause,
          optional($.property_pattern_clause),
          optional($._simple_designation)
        ),
        seq(
          choice(seq($.positional_pattern_clause, $.property_pattern_clause), $.property_pattern_clause),
          optional($._simple_designation)
        )
      ),

    positional_pattern_clause: ($) =>
      prec(1, seq('(', optional(commaSep($.subpattern)), choice(')', alias(sym('_pattern_paren_end'), ')')))),

    _untyped_positional_pattern_clause: ($) =>
      prec(
        1,
        seq(
          '(',
          optional(choice(commaSep2($.subpattern), alias($._named_subpattern, $.subpattern))),
          choice(')', alias(sym('_pattern_paren_end'), ')'))
        )
      ),

    _named_subpattern: ($) => subpattern($, true),

    property_pattern_clause: ($) =>
      prec(
        1,
        seq('{', commaSep($.subpattern), optional(','), choice('}', alias(sym('_nonprimary_expression_end'), '}')))
      ),

    subpattern: ($) => subpattern($),

    relational_pattern: ($) => prec.left(PREC.REL, seq(choice('<', '<=', '>', '>='), $.expression)),

    negated_pattern: ($) => seq('not', $.pattern),

    and_pattern: ($) =>
      prec.dynamic(
        2,
        prec.left(PREC.AND, seq(field('left', $.pattern), field('operator', 'and'), field('right', $.pattern)))
      ),

    or_pattern: ($) =>
      prec.dynamic(
        2,
        prec.left(PREC.OR, seq(field('left', $.pattern), field('operator', 'or'), field('right', $.pattern)))
      ),

    declaration_pattern: ($) => seq(field('type', $._pattern_declaration_type), $._simple_designation),

    _variable_designation: ($) => choice($._simple_designation, $.parenthesized_variable_designation),

    // C# admits a parenthesized designation in a pattern only after `var`; elsewhere `T (x)` and `nameof(x)` are
    // positional patterns or invocations.
    _simple_designation: ($) =>
      prec(
        1,
        choice(
          $.discard,
          field('name', $.identifier),
          prec.dynamic(-2, field('name', alias(choice('and', 'or'), $.identifier)))
        )
      ),

    parenthesized_variable_designation: ($) => seq('(', commaSep($._variable_designation), ')'),

    expression: ($) =>
      choice(
        $._unary_expression,
        $.assignment_expression,
        $.binary_expression,
        $.conditional_expression,
        $.is_pattern_expression,
        $.as_expression,
        $.switch_expression,
        $.throw_expression,
        $.lambda_expression,
        $.with_expression,
        $.ref_expression,
        $.range_expression,
        $.initializer_expression,
        $.query_expression
      ),

    _unary_expression: ($) =>
      choice($._primary_expression, $.prefix_unary_expression, $.cast_expression, $.await_expression),

    _primary_expression: ($) =>
      choice(
        $._primary_no_conditional_access_expression,
        $.conditional_access_expression,
        alias($._conditional_suppression_expression, $.postfix_unary_expression)
      ),

    _nonconditional_unary_expression: ($) =>
      choice(
        $._primary_no_conditional_access_expression,
        alias($._assignment_target_prefix_unary_expression, $.prefix_unary_expression),
        alias($._assignment_target_cast_expression, $.cast_expression),
        alias($._assignment_target_await_expression, $.await_expression)
      ),

    _assignment_target_unary_operand: ($) =>
      choice(
        $._nonconditional_unary_expression,
        alias($._assignment_target_prefix_range_expression, $.range_expression)
      ),

    _assignment_target_prefix_unary_expression: ($) => prefixUnaryExpression($._assignment_target_unary_operand),

    _assignment_target_cast_expression: ($) =>
      castExpression(
        $,
        $._nonconditional_unary_expression,
        alias($._assignment_target_prefix_range_expression, $.range_expression)
      ),

    _assignment_target_prefix_range_expression: ($) => prefixRangeExpression($._assignment_target_unary_operand),

    _assignment_target_await_expression: ($) =>
      prec.right(PREC.UNARY, seq('await', $._assignment_target_unary_operand)),

    _conditional_suppression_expression: ($) =>
      postfixExpression(
        choice(
          $.conditional_access_expression,
          alias($._conditional_suppression_expression, $.postfix_unary_expression)
        ),
        bangOperator()
      ),

    _conditional_update_expression: ($) =>
      postfixExpression(
        choice(
          $.conditional_access_expression,
          alias($._conditional_suppression_expression, $.postfix_unary_expression)
        ),
        choice('++', '--')
      ),

    _primary_no_conditional_access_expression: ($) =>
      primaryAtoms($, {
        name: choice($._expression_simple_name, $.alias_qualified_name),
        member: $.member_access_expression,
        collection: true,
      }),

    _conditional_access_receiver: ($) =>
      primaryAtoms($, {
        name: choice($._expression_simple_name, $.alias_qualified_name),
        member: $.member_access_expression,
        collection: true,
        element: $.element_access_expression,
        invocation: $.invocation_expression,
        tuple: true,
        array: alias($._initialized_array_creation_expression, $.array_creation_expression),
        stackalloc: alias($._initialized_stackalloc_expression, $.stackalloc_expression),
        definite: false,
      }),

    _definite_conditional_access_receiver: ($) =>
      primaryAtoms($, {
        name: choice($._expression_simple_name, $.alias_qualified_name),
        member: $.member_access_expression,
        collection: true,
        element: $.element_access_expression,
        invocation: $.invocation_expression,
        tuple: true,
        array: alias($._initialized_array_creation_expression, $.array_creation_expression),
        stackalloc: alias($._initialized_stackalloc_expression, $.stackalloc_expression),
        definite: true,
      }),

    _expression_statement_expression: ($) => choice($._unary_expression, $.assignment_expression),

    assignment_expression: ($) => assignmentExpression($, $._nonconditional_unary_expression),

    binary_expression: ($) =>
      choice(
        ...binaryOperators().map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq(field('left', $.expression), field('operator', operator), field('right', $.expression))
          )
        ),
        prec.right(
          PREC.COALESCING,
          seq(field('left', $.expression), field('operator', '??'), field('right', $.expression))
        )
      ),

    postfix_unary_expression: ($) =>
      choice(
        postfixExpression($._primary_no_conditional_access_expression, choice('++', '--', bangOperator())),
        $._generic_invocation_suppression_expression
      ),

    prefix_unary_expression: ($) => prefixUnaryExpression($._unary_operand),

    query_expression: ($) => seq($.from_clause, $._query_body),

    from_clause: ($) => seq('from', optional(field('type', $.type)), field('name', $.identifier), 'in', $.expression),

    _query_body: ($) =>
      prec.right(sep1(seq(repeat($._query_clause), $._select_or_group_clause), seq('into', $.identifier))),

    _query_clause: ($) => choice($.from_clause, $.join_clause, $.let_clause, $.order_by_clause, $.where_clause),

    join_clause: ($) => seq('join', $._join_header, $._join_body, optional($.join_into_clause)),

    _join_header: ($) => seq(optional(field('type', $.type)), $.identifier, 'in', $.expression),

    _join_body: ($) => seq('on', $.expression, 'equals', $.expression),

    join_into_clause: ($) => seq('into', $.identifier),

    let_clause: ($) => seq('let', $.identifier, '=', $.expression),

    order_by_clause: ($) => seq('orderby', commaSep1($._ordering)),

    _ordering: ($) => seq($.expression, optional(choice('ascending', 'descending'))),

    where_clause: ($) => seq('where', $.expression),

    _select_or_group_clause: ($) => choice($.group_clause, $.select_clause),

    group_clause: ($) => seq('group', $.expression, 'by', $.expression),

    select_clause: ($) => seq('select', $.expression),

    conditional_expression: ($) =>
      prec.right(
        PREC.CONDITIONAL,
        seq(
          field('condition', $.expression),
          ternaryQuestion(),
          field('consequence', $.expression),
          ':',
          sym('_conditional_alternative_start'),
          field('alternative', $.expression)
        )
      ),

    conditional_access_expression: ($) =>
      choice(
        $._conditional_assignment_expression,
        conditionalAccessExpression($, $._conditional_access_receiver),
        seq(
          field('condition', $._definite_conditional_access_receiver),
          definiteAccessQuestion(),
          field('consequence', $._conditional_access_consequence)
        ),
        seq(
          field('condition', $.array_creation_expression),
          memberAccessQuestion(),
          field('consequence', $._member_conditional_access_consequence)
        )
      ),

    _member_conditional_access_consequence: ($) => $._member_conditional_binding_expression,

    _member_conditional_binding_expression: ($) =>
      choice(
        $._member_nonconditional_binding_expression,
        alias($._member_binding_conditional_access_expression, $.conditional_access_expression)
      ),

    _member_nonconditional_binding_expression: ($) =>
      choice(
        $.member_binding_expression,
        alias($._member_binding_member_access_expression, $.member_access_expression),
        alias($._member_binding_element_access_expression, $.element_access_expression),
        alias($._member_binding_invocation_expression, $.invocation_expression)
      ),

    _member_conditional_binding_receiver: ($) =>
      choice(
        $._member_nonconditional_binding_expression,
        alias($._member_binding_suppression_expression, $.postfix_unary_expression),
        alias($._member_binding_generic_suppression_expression, $.postfix_unary_expression)
      ),

    _member_binding_suppression_expression: ($) =>
      postfixExpression($._member_conditional_binding_receiver, bangOperator()),

    _member_binding_member_access_expression: ($) => memberAccessExpression($, $._member_conditional_binding_receiver),

    _member_binding_element_access_expression: ($) =>
      elementAccessExpression($, $._member_conditional_binding_receiver),

    _member_binding_invocation_expression: ($) =>
      choice(
        invocationExpression($, $._member_conditional_binding_receiver),
        $._member_binding_generic_invocation_expression
      ),

    _member_binding_generic_invocation_expression: ($) =>
      genericInvocationExpression(
        $,
        choice(
          alias($._generic_member_binding_expression, $.member_binding_expression),
          alias($._member_binding_generic_member_expression, $.member_access_expression)
        ),
        $._member_binding_generic_invocation_expression,
        $._member_binding_generic_suppression_expression
      ),

    _member_binding_generic_member_expression: ($) =>
      memberAccessExpression($, $._member_conditional_binding_receiver, $._generic_invocation_simple_name),

    _member_binding_generic_suppression_expression: ($) =>
      seq(
        genericInvocationReceiver(
          $,
          $._member_binding_generic_invocation_expression,
          $._member_binding_generic_suppression_expression
        ),
        bangOperator()
      ),

    _member_binding_conditional_access_expression: ($) =>
      conditionalAccessExpression($, $._member_conditional_binding_receiver),

    _member_conditional_binding_assignment_expression: ($) =>
      assignmentExpression($, $._member_conditional_binding_receiver),

    _conditional_access_consequence: ($) => $._conditional_binding_expression,

    _conditional_binding_expression: ($) =>
      choice(
        $._nonconditional_binding_expression,
        alias($._binding_conditional_access_expression, $.conditional_access_expression)
      ),

    _nonconditional_binding_expression: ($) =>
      choice(
        $.member_binding_expression,
        alias($.bracketed_argument_list, sym('element_binding_expression')),
        alias($._binding_member_access_expression, $.member_access_expression),
        alias($._binding_element_access_expression, $.element_access_expression),
        alias($._binding_invocation_expression, $.invocation_expression)
      ),

    _conditional_binding_receiver: ($) =>
      choice(
        $._nonconditional_binding_expression,
        alias($._binding_suppression_expression, $.postfix_unary_expression),
        alias($._binding_generic_suppression_expression, $.postfix_unary_expression)
      ),

    _binding_suppression_expression: ($) => postfixExpression($._conditional_binding_receiver, bangOperator()),

    _binding_member_access_expression: ($) => memberAccessExpression($, $._conditional_binding_receiver),

    _binding_element_access_expression: ($) => elementAccessExpression($, $._conditional_binding_receiver),

    _binding_invocation_expression: ($) =>
      choice(invocationExpression($, $._conditional_binding_receiver), $._binding_generic_invocation_expression),

    _binding_generic_invocation_expression: ($) =>
      genericInvocationExpression(
        $,
        choice(
          alias($._generic_member_binding_expression, $.member_binding_expression),
          alias($._binding_generic_member_expression, $.member_access_expression)
        ),
        $._binding_generic_invocation_expression,
        $._binding_generic_suppression_expression
      ),

    _binding_generic_member_expression: ($) =>
      memberAccessExpression($, $._conditional_binding_receiver, $._generic_invocation_simple_name),

    _binding_generic_suppression_expression: ($) =>
      seq(
        genericInvocationReceiver(
          $,
          $._binding_generic_invocation_expression,
          $._binding_generic_suppression_expression
        ),
        bangOperator()
      ),

    _binding_conditional_access_expression: ($) => conditionalAccessExpression($, $._conditional_binding_receiver),

    _conditional_binding_assignment_expression: ($) => assignmentExpression($, $._conditional_binding_receiver),

    _conditional_assignment_expression: ($) =>
      choice(
        seq(
          field('condition', $._conditional_access_receiver),
          accessQuestion(),
          field('consequence', $._conditional_assignment_consequence)
        ),
        seq(
          field('condition', $._definite_conditional_access_receiver),
          definiteAccessQuestion(),
          field('consequence', $._conditional_assignment_consequence)
        ),
        seq(
          field('condition', $.array_creation_expression),
          memberAccessQuestion(),
          field('consequence', $._member_conditional_assignment_consequence)
        )
      ),

    _conditional_assignment_consequence: ($) =>
      choice(
        alias($._conditional_binding_assignment_expression, $.assignment_expression),
        alias($._binding_conditional_assignment_expression, $.conditional_access_expression)
      ),

    _member_conditional_assignment_consequence: ($) =>
      choice(
        alias($._member_conditional_binding_assignment_expression, $.assignment_expression),
        alias($._member_binding_conditional_assignment_expression, $.conditional_access_expression)
      ),

    _binding_conditional_assignment_expression: ($) =>
      seq(
        field('condition', $._conditional_binding_receiver),
        accessQuestion(),
        field('consequence', $._conditional_assignment_consequence)
      ),

    _member_binding_conditional_assignment_expression: ($) =>
      seq(
        field('condition', $._member_conditional_binding_receiver),
        accessQuestion(),
        field('consequence', $._conditional_assignment_consequence)
      ),

    _postfix_receiver: ($) =>
      choice(
        $._primary_no_conditional_access_expression,
        alias($._conditional_assignment_expression, $.conditional_access_expression)
      ),

    _conditional_assignment_suppression_expression: ($) =>
      postfixExpression(
        choice(
          alias($._conditional_assignment_expression, $.conditional_access_expression),
          alias($._conditional_assignment_suppression_expression, $.postfix_unary_expression)
        ),
        bangOperator()
      ),

    as_expression: ($) =>
      prec(
        PREC.REL,
        seq(
          field('left', $.expression),
          field('operator', alias(sym('_type_context_as'), 'as')),
          field('right', $.type)
        )
      ),

    is_pattern_expression: ($) =>
      prec(
        PREC.REL,
        seq(
          field('expression', $.expression),
          alias(sym('_type_context_is'), 'is'),
          field('pattern', alias($._is_pattern, $.pattern))
        )
      ),

    // C# treats a non-generic terminal name followed by a nonempty collection as parenthesized indexing.
    cast_expression: ($) =>
      castExpression($, $._non_range_unary_operand, alias($._prefix_range_expression, $.range_expression)),

    _non_range_unary_operand: ($) => choice($._unary_expression, $.query_expression),

    _unary_operand: ($) => choice($._non_range_unary_operand, alias($._prefix_range_expression, $.range_expression)),

    _prefix_range_expression: ($) => prefixRangeExpression($._unary_operand),

    _range_cast_type: ($) =>
      choice(
        typeAlternatives($, false, true, false, false, $.alias_qualified_name),
        alias($._omitted_cast_array_type, $.array_type)
      ),

    _omitted_cast_array_type: ($) =>
      seq(
        field('type', $._array_base_type),
        field('rank', alias($._omitted_array_rank_specifier, $.array_rank_specifier))
      ),

    _omitted_array_rank_specifier: () => seq('[', repeat(','), ']'),

    _ambiguous_cast_type: ($) => $._ambiguous_cast_name,

    _definite_cast_type: ($) =>
      choice(
        typeAlternatives($, false, true, true, false, $._definite_cast_name),
        alias($._omitted_cast_array_type, $.array_type)
      ),

    _preferred_cast_head: ($) =>
      choice(
        prec.dynamic(
          2,
          seq('(', field('type', alias($._ambiguous_cast_type, $.type)), alias(sym('_ambiguous_cast_type_end'), ')'))
        ),
        prec.dynamic(
          3,
          seq(
            '(',
            field('type', alias($._omitted_cast_array_type, $.array_type)),
            alias(sym('_definite_cast_type_end'), ')')
          )
        )
      ),

    _preferred_range_cast_head: ($) =>
      prec.dynamic(
        3,
        seq(
          '(',
          field('type', alias($._omitted_cast_array_type, $.array_type)),
          alias(sym('_range_cast_type_end'), ')')
        )
      ),

    _ambiguous_cast_name: ($) => choice($.identifier, alias($._ambiguous_cast_qualified_name, $.qualified_name)),

    _ambiguous_cast_qualified_name: ($) => seq(field('qualifier', $._name), '.', field('name', $.identifier)),

    _definite_cast_name: ($) =>
      choice($.generic_name, $.alias_qualified_name, alias($._definite_cast_qualified_name, $.qualified_name)),

    _definite_cast_qualified_name: ($) => seq(field('qualifier', $._name), '.', field('name', $.generic_name)),

    checked_expression: ($) => seq(choice('checked', 'unchecked'), '(', $.expression, ')'),

    invocation_expression: ($) =>
      choice(invocationExpression($, $._postfix_receiver), $._generic_invocation_expression),

    _generic_invocation_expression: ($) =>
      genericInvocationExpression(
        $,
        choice(
          $._generic_invocation_simple_name,
          alias($._pattern_generic_member_expression, $.member_access_expression),
          alias($._generic_alias_qualified_name, $.alias_qualified_name)
        ),
        $._generic_invocation_expression,
        $._generic_invocation_suppression_expression
      ),

    _generic_member_binding_expression: ($) => seq('.', field('name', $._generic_invocation_simple_name)),

    _generic_invocation_simple_name: ($) => $.generic_name,

    _generic_alias_qualified_name: ($) => seq(field('alias', $.identifier), '::', field('name', $.generic_name)),

    _generic_invocation_suppression_expression: ($) =>
      postfixExpression(
        genericInvocationReceiver($, $._generic_invocation_expression, $._generic_invocation_suppression_expression),
        bangOperator()
      ),

    switch_expression: ($) => switchExpression($, $.expression),
    _switch_expression_body: ($) =>
      seq(
        '{',
        commaSep($.switch_expression_arm),
        optional(','),
        choice('}', alias(sym('_nonprimary_expression_end'), '}'))
      ),

    switch_expression_arm: ($) => seq($.pattern, optional($.when_clause), '=>', $.expression),

    when_clause: ($) => seq('when', $.expression),

    await_expression: ($) => prec.right(PREC.UNARY, seq('await', $._unary_operand)),

    throw_expression: ($) => seq('throw', $.expression),

    element_access_expression: ($) => elementAccessExpression($, $._postfix_receiver),

    interpolated_string_expression: ($) =>
      choice(
        seq(
          alias(sym('interpolation_regular_start'), sym('interpolation_start')),
          alias(sym('interpolation_start_quote'), '"'),
          repeat($._interpolated_string_content),
          alias(sym('interpolation_end_quote'), '"')
        ),
        seq(
          alias(sym('interpolation_verbatim_start'), sym('interpolation_start')),
          alias(sym('interpolation_start_quote'), '"'),
          repeat($._interpolated_verbatim_string_content),
          alias(sym('interpolation_end_quote'), '"')
        ),
        seq(
          alias(sym('interpolation_raw_start'), sym('interpolation_start')),
          alias(sym('interpolation_start_quote'), sym('interpolation_quote')),
          repeat($._interpolated_raw_string_content),
          alias(sym('interpolation_end_quote'), sym('interpolation_quote'))
        )
      ),

    _interpolated_string_content: ($) =>
      choice(alias(sym('interpolation_string_content'), sym('string_content')), $.escape_sequence, $.interpolation),

    _interpolated_verbatim_string_content: ($) =>
      choice(
        alias(sym('interpolation_string_content'), sym('string_content')),
        alias($._multiline_interpolation, $.interpolation)
      ),

    _interpolated_raw_string_content: ($) =>
      choice(
        alias(sym('interpolation_string_content'), sym('string_content')),
        alias($._multiline_interpolation, $.interpolation)
      ),

    interpolation: ($) =>
      seq(
        alias(sym('interpolation_open_brace'), sym('interpolation_brace')),
        $.expression,
        optional($.interpolation_alignment_clause),
        choice(
          alias(sym('interpolation_close_brace'), sym('interpolation_brace')),
          seq($.interpolation_format_clause, alias(token.immediate('}'), sym('interpolation_brace')))
        )
      ),

    interpolation_alignment_clause: ($) => seq(',', $.expression),

    interpolation_format_clause: () =>
      prec.dynamic(
        1,
        seq(
          choice(alias(sym('_interpolation_format_colon'), ':'), ':'),
          optional(sym('_file_directive_literal_context')),
          token.immediate(/[^}"\n\r\u0085\u2028\u2029]+/)
        )
      ),

    _multiline_interpolation: ($) =>
      seq(
        alias(sym('interpolation_open_brace'), sym('interpolation_brace')),
        $.expression,
        optional($.interpolation_alignment_clause),
        optional(alias($._multiline_interpolation_format_clause, $.interpolation_format_clause)),
        alias(sym('interpolation_close_brace'), sym('interpolation_brace'))
      ),

    _multiline_interpolation_format_clause: () =>
      prec.dynamic(
        1,
        seq(
          choice(alias(sym('_interpolation_format_colon'), ':'), ':'),
          optional(sym('_file_directive_literal_context')),
          /[^}"]+/
        )
      ),

    member_access_expression: ($) => memberAccessExpression($, choice($._postfix_receiver, $.predefined_type, $._name)),

    member_binding_expression: ($) => seq('.', field('name', $._expression_simple_name)),

    object_creation_expression: ($) =>
      prec.right(
        seq(
          'new',
          field('type', $._object_creation_type),
          choice(
            seq(
              field('arguments', $.argument_list),
              field('initializer', optional(alias($._object_initializer_expression, $.initializer_expression)))
            ),
            field('initializer', alias($._object_initializer_expression, $.initializer_expression))
          )
        )
      ),

    _object_creation_type: ($) => typeAlternatives($, true, true, true, false),

    parenthesized_expression: ($) => seq('(', $.expression, ')'),

    lambda_expression: ($) =>
      prec(-1, seq($._lambda_expression_init, '=>', field('body', choice($.block, $.expression)))),

    _lambda_expression_init: ($) =>
      prec(
        -1,
        seq(
          repeat($._attribute_list),
          repeat(prec.dynamic(1, alias(choice('static', 'async'), $.modifier))),
          choice(
            field('parameters', prec(-1, alias($.identifier, sym('implicit_parameter')))),
            seq(optional(field('type', $.type)), field('parameters', $._lambda_parameters))
          )
        )
      ),

    _lambda_parameters: ($) =>
      prec(
        -1,
        choice(
          $.parameter_list,
          // C# 14: `(ref x) => x`, `(out y) => ...`, `(text, out result) => ...`
          // The opening '(' is recognized via the external _lambda_paren_open
          // token, which the scanner only emits when it can confirm a closing
          // ')=>' follows a parameter list containing at least one modifier.
          $._implicit_parameter_list_with_modifiers
        )
      ),

    // C# 14 simple-lambda parameter list with modifiers. Each element is
    // either a bare identifier or one or more modifiers (scoped/ref/out/in/
    // readonly) followed by an identifier. The opening token is the
    // external _lambda_paren_open; the closing ')' is the regular literal.
    _implicit_parameter_list_with_modifiers: ($) =>
      seq(
        sym('_lambda_paren_open'),
        commaSep1(
          choice(
            seq(
              repeat1(alias(choice('scoped', 'ref', 'out', 'in', 'readonly'), $.modifier)),
              alias($.identifier, sym('implicit_parameter'))
            ),
            alias($.identifier, sym('implicit_parameter'))
          )
        ),
        ')'
      ),

    array_creation_expression: ($) => arrayCreationExpression($, optional($.initializer_expression)),

    _initialized_array_creation_expression: ($) => arrayCreationExpression($, $.initializer_expression),

    _initialized_stackalloc_expression: ($) => stackallocExpression($, $.initializer_expression),

    anonymous_method_expression: ($) =>
      seq(
        repeat(prec.dynamic(1, alias(choice('static', 'async'), $.modifier))),
        'delegate',
        optional(field('parameters', $.parameter_list)),
        $.block
      ),

    anonymous_object_creation_expression: ($) =>
      seq('new', '{', commaSep($._anonymous_object_member_declarator), optional(','), '}'),

    _anonymous_object_member_declarator: ($) => choice(seq($.identifier, '=', $.expression), $.expression),

    implicit_array_creation_expression: ($) => seq('new', '[', repeat(','), ']', $.initializer_expression),

    implicit_object_creation_expression: ($) =>
      prec.right(
        seq('new', $.argument_list, optional(alias($._object_initializer_expression, $.initializer_expression)))
      ),

    implicit_stackalloc_expression: ($) => seq('stackalloc', '[', ']', $.initializer_expression),

    collection_expression: ($) => seq('[', optional(seq(commaSep1($.collection_element), optional(','))), ']'),

    collection_element: ($) => choice($.expression_element, $.spread_element),

    expression_element: ($) => prec(1, $.expression),

    spread_element: ($) => prec.dynamic(1, prec(PREC.RANGE, seq('..', $.expression))),

    _object_initializer_expression: ($) =>
      seq(
        '{',
        commaSep(
          choice(
            alias($._object_index_initializer, $.assignment_expression),
            alias($._object_member_initializer, $.assignment_expression),
            $.expression
          )
        ),
        optional(','),
        '}'
      ),

    _object_initializer_value: ($) =>
      choice($.expression, alias($._object_initializer_expression, $.initializer_expression)),

    _object_index_initializer: ($) =>
      assignmentExpression(
        $,
        alias($._object_index_target, sym('element_binding_expression')),
        '=',
        $._object_initializer_value
      ),

    _object_index_target: ($) => bracketedArgumentList($, alias(sym('_object_index_start'), '[')),

    _object_member_initializer: ($) => assignmentExpression($, $.identifier, '=', $._object_initializer_value),

    initializer_expression: ($) => seq('{', commaSep($.expression), optional(','), '}'),

    declaration_expression: ($) => prec.dynamic(1, seq(field('type', $.type), field('name', $.identifier))),

    default_expression: ($) => prec.right(seq('default', optional(seq('(', field('type', $.type), ')')))),

    with_expression: ($) => withExpression($, $.expression),
    _with_body: ($) =>
      seq('{', commaSep($.with_initializer), optional(','), choice('}', alias(sym('_nonprimary_expression_end'), '}'))),

    with_initializer: ($) => seq($.identifier, '=', $.expression),

    sizeof_expression: ($) => seq('sizeof', '(', field('type', $.type), ')'),

    typeof_expression: ($) => seq('typeof', '(', field('type', $.type), ')'),

    makeref_expression: ($) => seq('__makeref', '(', $.expression, ')'),

    ref_expression: ($) => seq('ref', $.expression),

    reftype_expression: ($) => seq('__reftype', '(', $.expression, ')'),

    refvalue_expression: ($) => seq('__refvalue', '(', field('value', $.expression), ',', field('type', $.type), ')'),

    stackalloc_expression: ($) => stackallocExpression($, optional($.initializer_expression)),

    range_expression: ($) => rangeExpression($.expression, $.expression),

    tuple_expression: ($) => seq('(', commaSep2(alias($._tuple_argument, $.argument)), ')'),

    _tuple_argument: ($) =>
      prec(
        1,
        seq(
          optional(seq(field('name', $.identifier), ':')),
          optional(choice('ref', 'out', 'in')),
          choice($.expression, prec.dynamic(-1, $.declaration_expression))
        )
      ),

    literal: ($) =>
      choice(
        $.null_literal,
        $.character_literal,
        $.integer_literal,
        $.real_literal,
        $.boolean_literal,
        $.string_literal,
        $.verbatim_string_literal,
        $.raw_string_literal
      ),

    null_literal: () => 'null',

    character_literal: ($) => seq("'", choice($.character_literal_content, $.escape_sequence), token.immediate("'")),

    character_literal_content: () => token.immediate(/[^'\\\r\n\u0085\u2028\u2029]/),

    integer_literal: () =>
      token(
        seq(
          choice(
            decimalDigitSequence, // Decimal
            /0[xX][0-9a-fA-F_]*[0-9a-fA-F]+/, // Hex
            /0[bB][01_]*[01]+/ // Binary
          ),
          optional(/([uU][lL]?|[lL][uU]?)/)
        )
      ),

    real_literal: () => {
      const suffix = /[fFdDmM]/;
      const exponent = /[eE][+-]?[0-9][0-9_]*/;
      return token(
        choice(
          seq(decimalDigitSequence, '.', decimalDigitSequence, optional(exponent), optional(suffix)),
          seq('.', decimalDigitSequence, optional(exponent), optional(suffix)),
          seq(decimalDigitSequence, exponent, optional(suffix)),
          seq(decimalDigitSequence, suffix)
        )
      );
    },

    string_literal: ($) =>
      seq(
        '"',
        repeat(choice($.string_literal_content, $.escape_sequence, sym('_file_directive_literal_context'))),
        token.immediate('"'),
        optional($.string_literal_encoding)
      ),

    string_literal_content: () => token.immediate(prec(1, /[^"\\\r\n\u0085\u2028\u2029]+/)),

    escape_sequence: () =>
      token.immediate(choice(/\\x[0-9a-fA-F]{1,4}/, /\\u[0-9a-fA-F]{4}/, /\\U[0-9a-fA-F]{8}/, /\\[abefnrtv'"\\?0]/)),

    string_literal_encoding: () => token.immediate(stringEncoding),

    verbatim_string_literal: () => token(seq('@"', repeat(choice(/[^"]/, '""')), '"', optional(stringEncoding))),

    raw_string_literal: () =>
      seq(sym('raw_string_start'), sym('raw_string_content'), sym('raw_string_end'), optional(stringEncoding)),

    boolean_literal: () => choice('true', 'false'),

    _identifier_token: () =>
      token(
        seq(
          optional('@'),
          /(\p{XID_Start}|_|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})(\p{XID_Continue}|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})*/u
        )
      ),
    identifier: ($) => choice($._identifier_token, $._reserved_identifier),

    _reserved_identifier: () => choice(...reservedIdentifiers()),

    ...preprocIf(
      '_in_method_signature',
      ($) => choice($.method_signature, alias(sym('preproc_if_in_method_signature'), sym('preproc_if'))),
      0,
      false,
      true
    ),
    ...preprocIf('_in_namespace', ($) => $._namespace_body_item, 1),
    ...preprocIfWithMixedContent(
      '_in_mixed_base_type',
      ($) => $._base_list_type,
      ($) => $._base_list_prefix,
      ($) =>
        choice(
          $._base_list_mixed_type,
          seq($._base_list_prefix, $._base_list_mixed_type),
          seq($._base_list_type, $._base_list_mixed_suffix)
        )
    ),
    ...preprocIfWithMixedContent(
      '_in_mixed_base_suffix',
      ($) => $._base_list_suffix,
      ($) => $._base_list_separator_path,
      ($) =>
        choice(
          $._base_list_mixed_suffix,
          seq($._base_list_suffix, $._base_list_mixed_suffix),
          seq($._base_list_separator_path, $._base_list_mixed_type)
        )
    ),
    ...preprocIf('_in_empty_base', ($) => $._base_list_trivia),
    ...preprocIf('_in_enum_base_clause', ($) => $._enum_base_clause, 0, false),
    ...preprocIfWithContent('_in_enum_base_type', ($) => $._enum_base_type),
    ...preprocIf('_in_base_list', ($) => $._base_list, 0, false),
    ...preprocIfWithContent('_in_base_list_type', ($) => $._base_list_type),
    ...preprocIf('_in_base_list_prefix', ($) => $._base_list_prefix, 0, false),
    ...preprocIf('_in_base_list_separator', ($) => $._base_list_separator_path, 0, false, true),
    ...preprocIf('_in_base_list_suffix', ($) => $._base_list_suffix, 0, false),
    ...preprocIf('', ($) => $.declaration),
    ...preprocIf('_in_top_level', ($) => choice($._top_level_item_no_statement, $.statement)),
    ...preprocIf('_in_expression', ($) => $.expression, -2, false),
    ...preprocIf('_in_enum_member_declaration', ($) => $.enum_member_declaration, 0, false),
    ...preprocIf('_in_attribute_list', ($) => $.attribute_list, -1, false),

    preproc_arg: ($) =>
      seq(
        token(prec(-1, /[^\s\u0085\u2028\u2029]([^/\r\n\u0085\u2028\u2029]|\/[^*\r\n\u0085\u2028\u2029])*/)),
        optional($._preproc_arg_slash)
      ),
    _file_directive_argument: ($) => seq(sym('_file_directive_preproc_arg'), optional($._preproc_arg_slash)),
    _preproc_arg_slash: () => token.immediate(/\//),
    preproc_directive: () => /#[ \t]*[a-zA-Z0-9]\w*/,

    _preproc_expression: ($) =>
      choice(
        $.identifier,
        $.boolean_literal,
        $.integer_literal,
        $.character_literal,
        alias($.preproc_unary_expression, sym('unary_expression')),
        alias($.preproc_binary_expression, $.binary_expression),
        alias($.preproc_parenthesized_expression, $.parenthesized_expression)
      ),

    preproc_parenthesized_expression: ($) => seq('(', $._preproc_expression, ')'),

    preproc_unary_expression: ($) =>
      prec.left(PREC.UNARY, seq(field('operator', bangOperator()), field('argument', $._preproc_expression))),

    preproc_binary_expression: ($) => {
      /** @type {[string, number][]} */
      const table = [
        ['||', PREC.LOGICAL_OR],
        ['&&', PREC.LOGICAL_AND],
        ['==', PREC.EQUAL],
        ['!=', PREC.EQUAL],
      ];

      return choice(
        ...table.map(([operator, precedence]) => {
          return prec.left(
            precedence,
            seq(
              field('left', $._preproc_expression),
              field('operator', operator),
              field('right', $._preproc_expression)
            )
          );
        })
      );
    },

    preproc_region: ($) =>
      seq(
        preprocessor('region'),
        optional(field('content', choice($.preproc_arg, alias($._file_directive_argument, $.preproc_arg)))),
        directiveEnd()
      ),

    preproc_endregion: ($) =>
      seq(
        preprocessor('endregion'),
        optional(field('content', choice($.preproc_arg, alias($._file_directive_argument, $.preproc_arg)))),
        directiveEnd()
      ),

    preproc_line: ($) =>
      seq(
        preprocessor('line'),
        choice(
          'default',
          'hidden',
          seq($.integer_literal, optional(alias($._preproc_filename, $.string_literal))),
          seq(
            '(',
            $.integer_literal,
            ',',
            $.integer_literal,
            ')',
            '-',
            '(',
            $.integer_literal,
            ',',
            $.integer_literal,
            ')',
            optional($.integer_literal),
            alias($._preproc_filename, $.string_literal)
          )
        ),
        directiveEnd()
      ),

    _preproc_filename: ($) =>
      seq(
        '"',
        repeat(
          choice(
            $.string_literal_content,
            sym('_file_directive_literal_context'),
            alias(token.immediate(prec(-1, '\\')), $.string_literal_content),
            alias(
              token.immediate(
                choice(/\\x[0-9a-fA-F]{1,4}/, /\\u[0-9a-fA-F]{4}/, /\\U[0-9a-fA-F]{8}/, /\\[abefnrtv'\\?0]/)
              ),
              $.escape_sequence
            )
          )
        ),
        token.immediate('"')
      ),

    preproc_pragma: ($) =>
      seq(
        preprocessor('pragma'),
        sym('_pragma_boundary'),
        optional(
          choice(
            seq('warning', choice('disable', 'restore'), commaSep(choice($.identifier, $.integer_literal))),
            seq('checksum', alias($._preproc_filename, $.string_literal), $.string_literal, $.string_literal),
            alias(sym('_pragma_text'), $.preproc_arg)
          )
        ),
        directiveEnd()
      ),

    preproc_nullable: () =>
      seq(
        preprocessor('nullable'),
        choice('enable', 'disable', 'restore'),
        optional(choice('annotations', 'warnings')),
        directiveEnd()
      ),

    preproc_error: ($) =>
      seq(
        preprocessor('error'),
        choice($.preproc_arg, alias($._file_directive_argument, $.preproc_arg)),
        directiveEnd()
      ),

    preproc_warning: ($) =>
      seq(
        preprocessor('warning'),
        choice($.preproc_arg, alias($._file_directive_argument, $.preproc_arg)),
        directiveEnd()
      ),

    preproc_define: ($) =>
      seq(
        preprocessor('define'),
        choice($.preproc_arg, alias($._file_directive_argument, $.preproc_arg)),
        directiveEnd()
      ),

    preproc_undef: ($) =>
      seq(
        preprocessor('undef'),
        choice($.preproc_arg, alias($._file_directive_argument, $.preproc_arg)),
        directiveEnd()
      ),

    file_directive: ($) =>
      seq(
        choice(
          fileDirectiveArguments(
            $,
            choice(alias(sym('_file_directive_sdk'), '#:sdk'), alias(sym('_file_directive_package'), '#:package')),
            '@',
            'metadata'
          ),
          fileDirectiveArguments($, alias(sym('_file_directive_property'), '#:property'), '=', 'value'),
          seq(
            choice(
              alias(sym('_file_directive_project'), '#:project'),
              alias(sym('_file_directive_ref'), '#:ref'),
              alias(sym('_file_directive_include'), '#:include'),
              alias(sym('_file_directive_exclude'), '#:exclude')
            ),
            optional(seq($._file_directive_spacing, field('value', $.file_directive_value)))
          ),
          seq(
            sym('file_directive_kind'),
            optional(seq($._file_directive_spacing, optional(field('value', $.file_directive_value))))
          )
        ),
        optional($._file_directive_spacing),
        choice(sym('_file_directive_newline'), sym('_end_of_input'))
      ),

    _file_directive_spacing: () => token.immediate(prec(1, new RegExp(`[${directiveHorizontal}]+`))),
    file_directive_name: () =>
      token.immediate(
        prec(
          2,
          choice(
            new RegExp(`[^${directiveWhitespace}@="]+`),
            new RegExp(String.raw`"([^"\\${directiveLineBreak}]|\\[^${directiveLineBreak}])*"`)
          )
        )
      ),
    file_directive_value: () =>
      token.immediate(
        prec(
          1,
          new RegExp(
            `[^${directiveWhitespace}]([^${directiveLineBreak}]*[^${directiveWhitespace}])?|//[^${directiveLineBreak}]*`
          )
        )
      ),

    shebang_directive: () => token(seq('#!', /[^\r\n\u0085\u2028\u2029]*/)),

    comment: () => token(choice(seq('//', /[^\r\n\u0085\u2028\u2029]*/), seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'))),
  },
});

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_file_directive_spacing' | 'file_directive_name' | 'file_directive_value'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} kind
 * @param {string} separator
 * @param {string} extraField
 * @returns {import('@willbooster/web-tree-sitter/dsl').SeqRule}
 */
function fileDirectiveArguments($, kind, separator, extraField) {
  return seq(
    kind,
    optional(
      seq(
        $._file_directive_spacing,
        choice(
          seq(
            field('name', $.file_directive_name),
            optional(
              choice(
                seq(
                  optional($._file_directive_spacing),
                  token.immediate(prec(2, separator)),
                  optional($._file_directive_spacing),
                  optional(field('value', $.file_directive_value))
                ),
                seq(optional($._file_directive_spacing), field(extraField, $.file_directive_value))
              )
            )
          ),
          field('value', $.file_directive_value)
        )
      )
    )
  );
}

/**
 * Ends a directive that opens no conditional section: at a line break, or at the end of the input, which a file may
 * reach without a final line break.
 *
 * @returns {import('@willbooster/web-tree-sitter/dsl').ChoiceRule}
 */
function directiveEnd() {
  return choice(directiveNewLine(), sym('_end_of_input'));
}

function directiveNewLine() {
  return sym('_directive_newline');
}

/**
 * @param {string} command
 *
 * @returns {import('@willbooster/web-tree-sitter/dsl').AliasRule}
 */
function preprocessor(command) {
  return alias(new RegExp('#[ \t]*' + command), '#' + command);
}

/**
 * @param {string} suffix
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleBuilder<PreprocContentRule>} complete
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleBuilder<PreprocContentRule>} prefix
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleBuilder<PreprocContentRule>} mixed
 * @returns {Record<string, import('@willbooster/web-tree-sitter/dsl').RuleBuilder<PreprocContentRule>>}
 */
function preprocIfWithMixedContent(suffix, complete, prefix, mixed) {
  const contents = [undefined, complete, prefix, mixed];
  /** @param {number} mask */
  function alternativeBlock(mask) {
    return choice(
      alias(sym('preproc_else' + suffix + mask), sym('preproc_else')),
      alias(sym('preproc_elif' + suffix + mask), sym('preproc_elif'))
    );
  }
  /**
   * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<PreprocContentRule>} $
   * @param {number} mask
   */
  function contentOrAlternative($, mask) {
    return choice(
      ...contents.map((content, provided) => {
        const remaining = mask & ~provided;
        const alternative = field(
          'alternative',
          remaining ? alternativeBlock(remaining) : optional(alternativeBlock(0))
        );
        return content ? seq(content($), alternative) : alternative;
      })
    );
  }
  /** @type {Record<string, import('@willbooster/web-tree-sitter/dsl').RuleBuilder<PreprocContentRule>>} */
  const rules = {
    ['preproc_if' + suffix]: ($) => conditionalDirective('if', $, contentOrAlternative($, 3), preprocessor('endif')),
  };
  for (const mask of [0, 1, 2, 3]) {
    rules['preproc_elif' + suffix + mask] = ($) => conditionalDirective('elif', $, contentOrAlternative($, mask));
    rules['preproc_else' + suffix + mask] = ($) =>
      seq(
        preprocessor('else'),
        choice(
          ...contents.flatMap((content, provided) => (content && (provided & mask) === mask ? [content($)] : [])),
          ...(mask === 0 ? [optional($._base_list_trivia)] : [])
        )
      );
  }
  return rules;
}

/**
 * @param {string} suffix
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleBuilder<PreprocContentRule>} content
 * @returns {Record<string, import('@willbooster/web-tree-sitter/dsl').RuleBuilder<PreprocContentRule>>}
 */
function preprocIfWithContent(suffix, content) {
  /** @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<PreprocContentRule>} $ */
  function contentOrAlternative($) {
    return choice(
      seq(content($), field('alternative', optional(alternativeBlock(false)))),
      seq(repeat($._base_list_trivia), field('alternative', alternativeBlock(true)))
    );
  }

  /** @param {boolean} required */
  function alternativeBlock(required) {
    const alternativeSuffix = suffix + (required ? '_with_content' : '');
    return choice(
      alias(sym('preproc_else' + alternativeSuffix), sym('preproc_else')),
      alias(sym('preproc_elif' + alternativeSuffix), sym('preproc_elif'))
    );
  }

  return {
    ...preprocIf(suffix, ($) => choice(content($), repeat1($._base_list_trivia)), 0, false),
    ['preproc_if' + suffix]: ($) => conditionalDirective('if', $, contentOrAlternative($), preprocessor('endif')),
    ['preproc_else' + suffix + '_with_content']: ($) => seq(preprocessor('else'), content($)),
    ['preproc_elif' + suffix + '_with_content']: ($) => conditionalDirective('elif', $, contentOrAlternative($)),
  };
}

/**
 *
 * @param {string} suffix
 *
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleBuilder<PreprocContentRule>} content
 *
 * @param {number} precedence
 *
 * @param {boolean} rep
 *
 * @param {boolean} required
 *
 * @returns {Record<string, import('@willbooster/web-tree-sitter/dsl').RuleBuilder<PreprocContentRule>>}
 */
function preprocIf(suffix, content, precedence = 0, rep = true, required = false) {
  /** @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<PreprocContentRule>} $ */
  function contentRule($) {
    const rule = content($);
    return rep ? repeat(rule) : required ? rule : optional(rule);
  }

  /**
   *
   * @returns {import('@willbooster/web-tree-sitter/dsl').ChoiceRule}
   */
  function alternativeBlock() {
    return choice(
      suffix ? alias(sym('preproc_else' + suffix), sym('preproc_else')) : sym('preproc_else'),
      suffix ? alias(sym('preproc_elif' + suffix), sym('preproc_elif')) : sym('preproc_elif')
    );
  }

  return {
    ['preproc_if' + suffix]: ($) =>
      prec(
        precedence,
        conditionalDirective(
          'if',
          $,
          contentRule($),
          field('alternative', optional(alternativeBlock())),
          preprocessor('endif')
        )
      ),

    ['preproc_else' + suffix]: ($) => prec(precedence, seq(preprocessor('else'), contentRule($))),

    ['preproc_elif' + suffix]: ($) =>
      prec(
        precedence,
        conditionalDirective('elif', $, contentRule($), field('alternative', optional(alternativeBlock())))
      ),
  };
}

/**
 * @param {'if' | 'elif'} command
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<PreprocContentRule>} $
 * @param {...import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} content
 */
function conditionalDirective(command, $, ...content) {
  return seq(preprocessor(command), field('condition', $._preproc_expression), directiveNewLine(), ...content);
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_expression_simple_name'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} receiver
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} [name]
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} [operator]
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function memberAccessExpression($, receiver, name = $._expression_simple_name, operator = choice('.', '->')) {
  return prec(PREC.DOT, seq(field('expression', receiver), operator, field('name', name)));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'bracketed_argument_list'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} receiver
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function elementAccessExpression($, receiver) {
  return prec(PREC.DOT, seq(field('expression', receiver), field('subscript', $.bracketed_argument_list)));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'argument_list'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} receiver
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function invocationExpression($, receiver) {
  return prec(PREC.INVOCATION, seq(field('function', receiver), field('arguments', $.argument_list)));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'argument_list' | 'invocation_expression' | 'postfix_unary_expression'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} first
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} call
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} suppression
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function genericInvocationExpression($, first, call, suppression) {
  return choice(
    prec.dynamic(1, invocationExpression($, first)),
    prec.dynamic(3, invocationExpression($, genericInvocationReceiver($, call, suppression)))
  );
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'invocation_expression' | 'postfix_unary_expression'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} call
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} suppression
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function genericInvocationReceiver($, call, suppression) {
  return choice(alias(call, $.invocation_expression), alias(suppression, $.postfix_unary_expression));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} operand
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function prefixUnaryExpression(operand) {
  return prec.right(
    PREC.UNARY,
    choice(
      seq(choice('++', '--', bangOperator(), '~'), operand),
      prec.dynamic(-2, seq(choice('+', '-', '^', '*', ampersandOperator()), operand))
    )
  );
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_ambiguous_cast_type' | '_definite_cast_type' | '_preferred_cast_head' | '_preferred_range_cast_head' | '_range_cast_type' | 'type'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} operand
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} [rangeOperand]
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function castExpression($, operand, rangeOperand) {
  return prec(
    PREC.CAST,
    prec.dynamic(
      1,
      choice(
        seq(
          '(',
          field('type', alias($._ambiguous_cast_type, $.type)),
          ')',
          sym('_ambiguous_cast_operand_start'),
          field('value', operand)
        ),
        seq('(', field('type', alias($._definite_cast_type, $.type)), ')', field('value', operand)),
        seq($._preferred_cast_head, field('value', operand)),
        ...(rangeOperand
          ? [
              seq('(', field('type', alias($._range_cast_type, $.type)), ')', field('value', rangeOperand)),
              seq($._preferred_range_cast_head, field('value', rangeOperand)),
            ]
          : [])
      )
    )
  );
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_conditional_access_consequence'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} receiver
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function conditionalAccessExpression($, receiver) {
  return seq(field('condition', receiver), accessQuestion(), field('consequence', $._conditional_access_consequence));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} receiver
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} operator
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function postfixExpression(receiver, operator) {
  return prec(PREC.POSTFIX, seq(receiver, operator));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'expression'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} receiver
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} [operator]
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} [value]
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function assignmentExpression(
  $,
  receiver,
  operator = choice('=', '+=', '-=', '*=', '/=', '%=', '&=', '^=', '|=', '<<=', '>>=', '>>>=', '??='),
  value = $.expression
) {
  return prec.right(PREC.ASSIGN, seq(field('left', receiver), field('operator', operator), field('right', value)));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'array_type'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} initializer
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function arrayCreationExpression($, initializer) {
  return prec.dynamic(PREC.UNARY, seq('new', field('type', $.array_type), initializer));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'type'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} initializer
 * @returns {import('@willbooster/web-tree-sitter/dsl').Rule}
 */
function stackallocExpression($, initializer) {
  return prec.left(seq('stackalloc', field('type', $.type), initializer));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'argument'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} opener
 */
function bracketedArgumentList($, opener) {
  return seq(opener, commaSep1($.argument), optional(','), ']');
}

function bangOperator() {
  return alias(sym('_bang_operator'), '!');
}

function definiteAccessQuestion() {
  return choice(alias(sym('_question_definite_access'), '?'), alias(sym('_question_unknown'), '?'));
}

function accessQuestion() {
  return choice(
    alias(sym('_question_member_access'), '?'),
    alias(sym('_question_element_access'), '?'),
    alias(sym('_question_unknown'), '?')
  );
}

function memberAccessQuestion() {
  return choice(alias(sym('_question_member_access'), '?'), alias(sym('_question_unknown'), '?'));
}

function ternaryQuestion() {
  return choice(alias(sym('_question_ternary'), '?'), alias(sym('_question_unknown'), '?'));
}

function nullableQuestion() {
  return choice(alias(sym('_question_nullable'), '?'), alias(sym('_question_unknown'), '?'));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} rule
 *
 * @returns {import('@willbooster/web-tree-sitter/dsl').SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} rule
 *
 * @returns {import('@willbooster/web-tree-sitter/dsl').SeqRule}
 */
function commaSep2(rule) {
  return seq(rule, repeat1(seq(',', rule)));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} rule
 *
 * @returns {import('@willbooster/web-tree-sitter/dsl').ChoiceRule}
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} rule
 *
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} separator
 *
 * @returns {import('@willbooster/web-tree-sitter/dsl').SeqRule}
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} rule
 *
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} separator
 *
 * @returns {import('@willbooster/web-tree-sitter/dsl').ChoiceRule}
 */
function sep(rule, separator) {
  return optional(sep1(rule, separator));
}

function binaryOperators() {
  /** @type {[import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral, number][]} */
  const operators = [
    ['&&', PREC.LOGICAL_AND],
    ['||', PREC.LOGICAL_OR],
    ['>>', PREC.SHIFT],
    ['>>>', PREC.SHIFT],
    ['<<', PREC.SHIFT],
    [ampersandOperator(), PREC.AND],
    ['^', PREC.XOR],
    ['|', PREC.OR],
    ['+', PREC.ADD],
    ['-', PREC.ADD],
    ['*', PREC.MULT],
    ['/', PREC.MULT],
    ['%', PREC.MULT],
    ['<', PREC.REL],
    ['<=', PREC.REL],
    ['==', PREC.EQUAL],
    ['!=', PREC.EQUAL],
    ['>=', PREC.REL],
    ['>', PREC.REL],
  ];
  return operators;
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_conditional_assignment_suppression_expression' | '_conditional_update_expression' | '_nameof_expression' | 'anonymous_method_expression' | 'anonymous_object_creation_expression' | 'array_creation_expression' | 'checked_expression' | 'collection_expression' | 'default_expression' | 'element_access_expression' | 'implicit_array_creation_expression' | 'implicit_object_creation_expression' | 'implicit_stackalloc_expression' | 'interpolated_string_expression' | 'invocation_expression' | 'literal' | 'makeref_expression' | 'object_creation_expression' | 'parenthesized_expression' | 'postfix_unary_expression' | 'reftype_expression' | 'refvalue_expression' | 'sizeof_expression' | 'stackalloc_expression' | 'tuple_expression' | 'typeof_expression'>} $
 * @param {{name?: import('@willbooster/web-tree-sitter/dsl').Rule, member: import('@willbooster/web-tree-sitter/dsl').Rule, collection: boolean, element?: import('@willbooster/web-tree-sitter/dsl').Rule, invocation?: import('@willbooster/web-tree-sitter/dsl').Rule, parenthesized?: import('@willbooster/web-tree-sitter/dsl').Rule, tuple?: boolean, array?: import('@willbooster/web-tree-sitter/dsl').Rule, stackalloc?: import('@willbooster/web-tree-sitter/dsl').Rule, definite?: boolean}} options
 */
function primaryAtoms(
  $,
  {
    name,
    member,
    collection,
    element = $.element_access_expression,
    invocation = $.invocation_expression,
    parenthesized = $.parenthesized_expression,
    tuple = true,
    array = $.array_creation_expression,
    stackalloc = $.stackalloc_expression,
    definite,
  }
) {
  const uncertain = [
    ...(name ? [name] : []),
    member,
    element,
    invocation,
    ...(tuple ? [$.tuple_expression] : []),
    parenthesized,
    ...(collection ? [$.collection_expression] : []),
    alias(sym('preproc_if_in_expression'), sym('preproc_if')),
  ];
  const completed = [
    alias($._nameof_expression, $.invocation_expression),
    alias($._conditional_update_expression, $.postfix_unary_expression),
    alias($._conditional_assignment_suppression_expression, $.postfix_unary_expression),
    'this',
    'base',
    $.postfix_unary_expression,
    $.literal,
    $.interpolated_string_expression,
    $.checked_expression,
    $.default_expression,
    $.sizeof_expression,
    $.typeof_expression,
    $.makeref_expression,
    $.reftype_expression,
    $.refvalue_expression,
    stackalloc,
    array,
    $.object_creation_expression,
    $.anonymous_method_expression,
    $.anonymous_object_creation_expression,
    $.implicit_array_creation_expression,
    $.implicit_object_creation_expression,
    $.implicit_stackalloc_expression,
  ];
  return choice(...(definite === true ? [] : uncertain), ...(definite === false ? [] : completed));
}

function reservedIdentifiers() {
  return [
    prec(-1, '_'),
    'alias',
    'allows',
    'async',
    'ascending',
    'by',
    'descending',
    'equals',
    // attribute_target_specifier keywords — contextual only when followed
    // by `:` in `[target: Attr]` position. Anywhere else they're
    // identifiers. Without listing them here the LR table preferred the
    // literal-keyword interpretation, breaking `[type]`, `[field]`, etc.
    // as collection_expression elements. Excludes `'event'` and `'return'`
    // from the attribute_target_specifier choice — those are real C#
    // keywords and must not be accepted as identifiers anywhere else.
    'field',
    'file',
    'from',
    'global',
    'group',
    'into',
    'join',
    'let',
    'method',
    'nameof',
    'nint',
    'nuint',
    'notnull',
    'on',
    'orderby',
    'param',
    'partial',
    'property',
    'required',
    'scoped',
    'select',
    'type',
    'typevar',
    'unmanaged',
    'var',
    'when',
    'where',
    'yield',
  ];
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} left
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} right
 * @param {boolean} [preferArithmetic]
 */
function arithmeticBinaryExpression(left, right, preferArithmetic = false) {
  return choice(
    ...binaryOperators()
      .filter(([, precedence]) => precedence >= PREC.SHIFT)
      .map(([operator, precedence]) => {
        const rule = prec.left(
          precedence,
          seq(field('left', left), field('operator', operator), field('right', right))
        );
        return preferArithmetic && operator !== '>>' && operator !== '>>>' ? prec.dynamic(2, rule) : rule;
      })
  );
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_name' | 'array_type' | 'function_pointer_type' | 'implicit_type' | 'nullable_type' | 'pointer_type' | 'predefined_type' | 'ref_type' | 'scoped_type' | 'tuple_type'>} $
 * @param {boolean} [implicit]
 * @param {boolean} [pointer]
 * @param {boolean} [tuple]
 * @param {boolean} [array]
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} [name]
 */
function typeAlternatives($, implicit = true, pointer = true, tuple = true, array = true, name = $._name) {
  return choice(
    ...(implicit ? [$.implicit_type] : []),
    ...(array ? [$.array_type] : []),
    name,
    $.nullable_type,
    ...(pointer ? [$.pointer_type] : []),
    $.function_pointer_type,
    $.predefined_type,
    ...(tuple ? [$.tuple_type] : []),
    $.ref_type,
    $.scoped_type
  );
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_parenthesized_pattern_with_designation' | 'and_pattern' | 'declaration_pattern' | 'discard' | 'list_pattern' | 'negated_pattern' | 'or_pattern' | 'parenthesized_pattern' | 'recursive_pattern' | 'relational_pattern' | 'slice_pattern' | 'type_pattern' | 'var_pattern'>} $
 */
function nonconstantPatterns($) {
  return choice(
    $.declaration_pattern,
    $.discard,
    $.recursive_pattern,
    $.var_pattern,
    $.negated_pattern,
    prec.dynamic(1, alias($._parenthesized_pattern_with_designation, $.recursive_pattern)),
    $.parenthesized_pattern,
    $.relational_pattern,
    $.or_pattern,
    $.and_pattern,
    $.list_pattern,
    $.slice_pattern,
    $.type_pattern
  );
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'expression' | 'identifier' | 'pattern'>} $
 * @param {boolean} [named]
 */
function subpattern($, named = false) {
  const name = choice(seq($.expression, ':'), seq($.identifier, ':'));
  return seq(named ? name : optional(name), $.pattern);
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_pattern_unary_expression' | 'binary_expression' | 'conditional_expression' | 'is_pattern_expression' | 'as_expression' | 'switch_expression' | 'throw_expression' | 'range_expression' | 'with_expression'>} $
 */
function nestedConstantExpressionRoots($) {
  return [
    $._pattern_unary_expression,
    $.binary_expression,
    $.conditional_expression,
    $.is_pattern_expression,
    $.as_expression,
    $.switch_expression,
    $.throw_expression,
    $.range_expression,
    $.with_expression,
  ];
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_is_arithmetic_binary_expression' | '_is_range_expression' | '_is_switch_expression' | '_is_with_expression' | '_pattern_unary_expression' | 'binary_expression' | 'range_expression' | 'switch_expression' | 'with_expression'>} $
 */
function constantExpressionRoots($) {
  return [
    $._pattern_unary_expression,
    alias($._is_arithmetic_binary_expression, $.binary_expression),
    alias($._is_range_expression, $.range_expression),
    alias($._is_switch_expression, $.switch_expression),
    alias($._is_with_expression, $.with_expression),
  ];
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_switch_expression_body'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} receiver
 */
function switchExpression($, receiver) {
  return prec(PREC.SWITCH, seq(receiver, 'switch', $._switch_expression_body));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').GrammarSymbols<'_with_body'>} $
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} receiver
 */
function withExpression($, receiver) {
  return prec.left(PREC.WITH, seq(receiver, 'with', $._with_body));
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} left
 * @param {import('@willbooster/web-tree-sitter/dsl').Rule} right
 * @param {boolean} [prefix]
 */
function rangeExpression(left, right, prefix = true) {
  return prec.right(PREC.RANGE, seq(prefix ? optional(left) : left, '..', optional(right)));
}

/** @param {import('@willbooster/web-tree-sitter/dsl').Rule} operand */
function prefixRangeExpression(operand) {
  return prec.right(PREC.RANGE, seq('..', optional(operand)));
}

function statementEnd() {
  return choice(';', alias(sym('_statement_end'), ';'));
}

function blockEnd() {
  return choice('}', alias(sym('_block_end'), '}'));
}

function ampersandOperator() {
  return alias(sym('_ampersand_operator'), '&');
}

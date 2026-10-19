import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Visual interaction state of a VITRUV control.
enum VitruvInteraction { idle, hovered, pressed, focused }

/// Shared behaviour for every tappable VITRUV primitive (buttons, interactive cards):
/// keyboard focus + activation (Enter/Space), hover, press, semantics and mouse cursor.
///
/// It owns *behaviour only*; the visual is produced by [builder] from the current state, so all
/// controls react identically. The focus ring is only shown for keyboard/traversal focus
/// (FocusHighlightMode.traditional), not after a touch.
class VitruvPressable extends StatefulWidget {
  const VitruvPressable({
    super.key,
    required this.onTap,
    required this.builder,
    this.semanticLabel,
    this.semanticValue,
    this.isButton = true,
    this.focusNode,
    this.autofocus = false,
    this.previewState,
  });

  /// `null` = disabled (exposed as disabled to assistive technology, no focus, no feedback).
  final VoidCallback? onTap;
  final Widget Function(BuildContext context, Set<VitruvInteraction> states)
  builder;
  final String? semanticLabel;

  /// Extra state for screen readers, e.g. "Lädt" while busy.
  final String? semanticValue;
  final bool isButton;
  final FocusNode? focusNode;
  final bool autofocus;

  /// Forces a visual state for the design gallery only (never use in product screens).
  final VitruvInteraction? previewState;

  @override
  State<VitruvPressable> createState() => _VitruvPressableState();
}

class _VitruvPressableState extends State<VitruvPressable> {
  bool _hovered = false;
  bool _pressed = false;
  bool _focusHighlighted = false;

  bool get _enabled => widget.onTap != null;

  Set<VitruvInteraction> get _states {
    if (widget.previewState != null) return {widget.previewState!};
    return {
      if (_hovered) VitruvInteraction.hovered,
      if (_pressed) VitruvInteraction.pressed,
      if (_focusHighlighted) VitruvInteraction.focused,
    };
  }

  void _activate() {
    HapticFeedback.selectionClick();
    widget.onTap?.call();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: widget.isButton,
      enabled: _enabled,
      label: widget.semanticLabel,
      value: widget.semanticValue,
      onTap: _enabled ? _activate : null,
      // The FocusableActionDetector below is excluded from semantics, so focus is reported here.
      focusable: _enabled ? true : null,
      focused: _enabled ? _focusHighlighted : null,
      excludeSemantics: widget.semanticLabel != null,
      child: FocusableActionDetector(
        enabled: _enabled,
        focusNode: widget.focusNode,
        autofocus: widget.autofocus,
        mouseCursor: _enabled
            ? SystemMouseCursors.click
            : SystemMouseCursors.forbidden,
        onShowHoverHighlight: (v) => setState(() => _hovered = v),
        onShowFocusHighlight: (v) => setState(() => _focusHighlighted = v),
        actions: {
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) => _activate(),
          ),
        },
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          excludeFromSemantics: true,
          onTapDown: _enabled ? (_) => setState(() => _pressed = true) : null,
          onTapUp: _enabled ? (_) => setState(() => _pressed = false) : null,
          onTapCancel: _enabled ? () => setState(() => _pressed = false) : null,
          onTap: _enabled ? _activate : null,
          child: widget.builder(context, _states),
        ),
      ),
    );
  }
}

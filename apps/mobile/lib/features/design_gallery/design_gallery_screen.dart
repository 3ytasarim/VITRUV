import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_token_types.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../shared/ui/ui.dart';

/// Development-only design gallery — the Flutter counterpart of the web `/design` page.
/// Shows foundations and every Stage C component in all states, with neutral demo content.
/// Access is controlled by `designGalleryEnabledProvider` (never in release builds by default).
class DesignGalleryScreen extends StatelessWidget {
  const DesignGalleryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Design-Galerie')),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            VitruvSpace.s5,
            VitruvSpace.s6,
            VitruvSpace.s5,
            VitruvSpace.s16,
          ),
          children: const [
            _Header(),
            _Section(id: 'colors', title: 'Farben', child: _Colors()),
            _Section(
              id: 'typography',
              title: 'Typografie',
              child: _Typography(),
            ),
            _Section(id: 'spacing', title: 'Abstände', child: _Spacing()),
            _Section(id: 'shapes', title: 'Chamfer & Glow', child: _Shapes()),
            _Section(id: 'buttons', title: 'Buttons', child: _Buttons()),
            _Section(id: 'cards', title: 'Karten', child: _Cards()),
            _Section(id: 'media', title: 'Media Frame', child: _Media()),
            _Section(id: 'labels', title: 'Labels & Status', child: _Labels()),
            _Section(
              id: 'navigation',
              title: 'Navigation',
              child: _Navigation(),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: VitruvSpace.s2,
          runSpacing: VitruvSpace.s2,
          children: [
            VitruvBadge('Nur Entwicklung', tone: VitruvTone.warning, dot: true),
            VitruvBadge('Sprint 1 · Stage C'),
          ],
        ),
        SizedBox(height: VitruvSpace.s6),
        SectionIntro(
          eyebrow: 'VITRUV — Logo-Asset ausstehend',
          title: 'Design System',
          size: SectionTitleSize.h1,
          lead:
              'Tokens aus packages/design-tokens und die Flutter-Komponenten. Kein Bestandteil '
              'der normalen App-Navigation.',
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.id, required this.title, required this.child});

  final String id;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: Key('gallery-$id'),
      padding: const EdgeInsets.only(top: VitruvSpace.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionIntro(
            eyebrow: 'Galerie',
            title: title,
            size: SectionTitleSize.h2,
          ),
          const SizedBox(height: VitruvSpace.s6),
          child,
        ],
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item(this.label, this.child);

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: VitruvSpace.s6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MetaLabel(label),
          const SizedBox(height: VitruvSpace.s3),
          child,
        ],
      ),
    );
  }
}

class _Colors extends StatelessWidget {
  const _Colors();

  @override
  Widget build(BuildContext context) {
    const c = VitruvColors.dark;
    final roles = <String, Color>{
      'bg': c.bg,
      'surface': c.surface,
      'surfaceSunken': c.surfaceSunken,
      'surfaceHover': c.surfaceHover,
      'fg': c.fg,
      'fgMuted': c.fgMuted,
      'fgSubtle': c.fgSubtle,
      'fgDisabled': c.fgDisabled,
      'accent': c.accent,
      'accentHover': c.accentHover,
      'accentText': c.accentText,
      'onAccent': c.onAccent,
      'border': c.border,
      'borderStrong': c.borderStrong,
      'focusRing': c.focusRing,
      'success': c.success,
      'warning': c.warning,
      'error': c.error,
    };
    return Wrap(
      spacing: VitruvSpace.s3,
      runSpacing: VitruvSpace.s3,
      children: [
        for (final MapEntry(key: name, value: color) in roles.entries)
          SizedBox(
            width: VitruvSpace.s28 + VitruvSpace.s12,
            child: VitruvCard(
              tone: VitruvCardTone.sunken,
              cut: ChamferCut.sm,
              padding: VitruvCardPadding.sm,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ExcludeSemantics(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: color,
                        border: Border.all(color: c.borderSubtle),
                      ),
                      child: const SizedBox(
                        height: VitruvSpace.s10,
                        width: double.infinity,
                      ),
                    ),
                  ),
                  const SizedBox(height: VitruvSpace.s2),
                  MetaLabel(name, color: c.fg),
                  MetaLabel(
                    '#${color.toARGB32().toRadixString(16).padLeft(8, '0').toUpperCase()}',
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _Typography extends StatelessWidget {
  const _Typography();

  @override
  Widget build(BuildContext context) {
    final roles = <String, VitruvTextRole>{
      'display': VitruvType.display,
      'h1': VitruvType.h1,
      'h2': VitruvType.h2,
      'h3': VitruvType.h3,
      'title': VitruvType.title,
      'eyebrow': VitruvType.eyebrow,
      'bodyLg': VitruvType.bodyLg,
      'body': VitruvType.body,
      'bodySm': VitruvType.bodySm,
      'caption': VitruvType.caption,
      'button': VitruvType.button,
    };
    final fg = VitruvTheme.of(context).fg;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final MapEntry(key: name, value: role) in roles.entries)
          _Item(
            '$name · ${role.minSize.round()}–${role.maxSize.round()} · ${role.fontFamily}',
            Text(
              role.apply('Stärke beginnt mit einem Plan'),
              style: vitruvTextStyle(context, role, fg),
            ),
          ),
      ],
    );
  }
}

class _Spacing extends StatelessWidget {
  const _Spacing();

  @override
  Widget build(BuildContext context) {
    final c = VitruvTheme.of(context);
    const steps = <String, double>{
      's1': VitruvSpace.s1,
      's2': VitruvSpace.s2,
      's3': VitruvSpace.s3,
      's4': VitruvSpace.s4,
      's6': VitruvSpace.s6,
      's8': VitruvSpace.s8,
      's12': VitruvSpace.s12,
      's16': VitruvSpace.s16,
      's24': VitruvSpace.s24,
    };
    return Column(
      children: [
        for (final MapEntry(key: name, value: px) in steps.entries)
          Padding(
            padding: const EdgeInsets.only(bottom: VitruvSpace.s2),
            child: Row(
              children: [
                SizedBox(
                  width: VitruvSpace.s20,
                  child: MetaLabel('$name · ${px.round()}'),
                ),
                ExcludeSemantics(
                  child: SizedBox(
                    width: px,
                    height: VitruvSpace.s3,
                    child: ColoredBox(color: c.accent),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Shapes extends StatelessWidget {
  const _Shapes();

  @override
  Widget build(BuildContext context) {
    final c = VitruvTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Item(
          'Chamfer xs · sm · md · lg (mit Rahmen)',
          Wrap(
            spacing: VitruvSpace.s4,
            runSpacing: VitruvSpace.s4,
            children: [
              for (final cut in ChamferCut.values)
                ChamferBox(
                  cut: cut,
                  border: BorderSide(
                    color: c.borderStrong,
                    width: VitruvShape.borderStrong,
                  ),
                  padding: const EdgeInsets.all(VitruvSpace.s5),
                  child: MetaLabel(
                    '${cut.name} · ${cut.size.round()}',
                    color: c.fg,
                  ),
                ),
            ],
          ),
        ),
        const _Item(
          'Glow: ohne · soft · accent strong',
          Wrap(
            spacing: VitruvSpace.s6,
            runSpacing: VitruvSpace.s6,
            children: [
              VitruvCard(
                padding: VitruvCardPadding.sm,
                child: MetaLabel('ohne'),
              ),
              VitruvCard(
                padding: VitruvCardPadding.sm,
                glow: true,
                child: MetaLabel('soft'),
              ),
              VitruvCard(
                tone: VitruvCardTone.accent,
                padding: VitruvCardPadding.sm,
                glow: true,
                child: MetaLabel('strong'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Buttons extends StatelessWidget {
  const _Buttons();

  @override
  Widget build(BuildContext context) {
    void noop() {}
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final variant in VitruvButtonVariant.values)
          _Item(
            variant.name,
            Wrap(
              spacing: VitruvSpace.s3,
              runSpacing: VitruvSpace.s3,
              children: [
                VitruvButton(
                  label: 'Normal',
                  variant: variant,
                  onPressed: noop,
                ),
                VitruvButton(
                  label: 'Gedrückt',
                  variant: variant,
                  onPressed: noop,
                  previewState: VitruvInteraction.pressed,
                ),
                VitruvButton(
                  label: 'Fokus',
                  variant: variant,
                  onPressed: noop,
                  previewState: VitruvInteraction.focused,
                ),
                VitruvButton(
                  label: 'Deaktiviert',
                  variant: variant,
                  onPressed: null,
                ),
                VitruvButton(
                  label: 'Lädt',
                  variant: variant,
                  onPressed: noop,
                  loading: true,
                ),
              ],
            ),
          ),
        _Item(
          'Icons · groß · volle Breite',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: VitruvSpace.s3,
                runSpacing: VitruvSpace.s3,
                children: [
                  VitruvButton(
                    label: 'Weiter',
                    trailingIcon: Icons.arrow_forward,
                    size: VitruvButtonSize.lg,
                    onPressed: noop,
                  ),
                  VitruvButton(
                    label: 'Hinzufügen',
                    leadingIcon: Icons.add,
                    variant: VitruvButtonVariant.secondary,
                    onPressed: noop,
                  ),
                ],
              ),
              const SizedBox(height: VitruvSpace.s3),
              VitruvButton(
                label: 'Volle Breite',
                fullWidth: true,
                onPressed: noop,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Cards extends StatelessWidget {
  const _Cards();

  @override
  Widget build(BuildContext context) {
    void noop() {}
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final tone in VitruvCardTone.values)
          Padding(
            padding: const EdgeInsets.only(bottom: VitruvSpace.s4),
            child: VitruvCard(
              tone: tone,
              glow: tone == VitruvCardTone.accent,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Wrap, not Row: at large text sizes the badge moves to the next line.
                  Wrap(
                    spacing: VitruvSpace.s3,
                    runSpacing: VitruvSpace.s2,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Eyebrow(tone.name),
                      if (tone == VitruvCardTone.accent)
                        const VitruvBadge('Empfohlen', tone: VitruvTone.accent),
                    ],
                  ),
                  const SizedBox(height: VitruvSpace.s4),
                  const Text('Beispielinhalt'),
                  const SizedBox(height: VitruvSpace.s2),
                  const VitruvMetaRow(['Woche 03', '45 Min', 'Beispiel']),
                ],
              ),
            ),
          ),
        _Item(
          'Interaktiv: normal · gedrückt · Fokus',
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final state in [
                null,
                VitruvInteraction.pressed,
                VitruvInteraction.focused,
              ])
                Padding(
                  padding: const EdgeInsets.only(bottom: VitruvSpace.s4),
                  child: VitruvCard.tappable(
                    onTap: noop,
                    semanticLabel: 'Beispiel-Einheit öffnen',
                    previewState: state,
                    child: Row(
                      children: [
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Eyebrow('Einheit 02 / 04'),
                              SizedBox(height: VitruvSpace.s2),
                              SectionTitle(
                                'Beispiel-Einheit',
                                size: SectionTitleSize.h3,
                                emphasis: true,
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.chevron_right,
                          color: VitruvTheme.of(context).fgMuted,
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Media extends StatelessWidget {
  const _Media();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Item(
          '16:9 · Testmuster',
          VitruvMediaFrame(semanticLabel: 'Testmuster', child: _TestPattern()),
        ),
        _Item(
          '4:5 · Platzhalter',
          VitruvMediaFrame(aspect: VitruvAspect.portrait, cut: ChamferCut.md),
        ),
        _Item(
          '1:1 · klein',
          SizedBox(
            width: VitruvSpace.s28,
            child: VitruvMediaFrame(
              aspect: VitruvAspect.square,
              cut: ChamferCut.sm,
            ),
          ),
        ),
      ],
    );
  }
}

/// Neutral generated test pattern (not editorial or private media).
class _TestPattern extends StatelessWidget {
  const _TestPattern();

  @override
  Widget build(BuildContext context) {
    final c = VitruvTheme.of(context);
    return CustomPaint(
      painter: _PatternPainter(line: c.border, accent: c.accent),
    );
  }
}

class _PatternPainter extends CustomPainter {
  _PatternPainter({required this.line, required this.accent});

  final Color line;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()..color = line;
    for (var x = 0.0; x <= size.width; x += size.width / 12) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (var y = 0.0; y <= size.height; y += size.height / 8) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    final diag = Paint()
      ..color = accent
      ..strokeWidth = VitruvShape.borderStrong;
    canvas.drawLine(Offset.zero, Offset(size.width, size.height), diag);
    canvas.drawLine(Offset(size.width, 0), Offset(0, size.height), diag);
  }

  @override
  bool shouldRepaint(_PatternPainter old) =>
      old.line != line || old.accent != accent;
}

class _Labels extends StatelessWidget {
  const _Labels();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Item(
          'Badges',
          Wrap(
            spacing: VitruvSpace.s2,
            runSpacing: VitruvSpace.s2,
            children: [
              VitruvBadge('Neutral'),
              VitruvBadge('6 Wochen', tone: VitruvTone.accent),
              VitruvBadge('Aktiv', tone: VitruvTone.success, dot: true),
              VitruvBadge('Ausstehend', tone: VitruvTone.warning, dot: true),
              VitruvBadge('Fehler', tone: VitruvTone.error, dot: true),
            ],
          ),
        ),
        _Item('Metadaten', VitruvMetaRow(['Woche 03', '45 Min', 'Kraft'])),
        _Item(
          'Fortschritt',
          VitruvProgress(value: 0.75, label: 'Einheiten', valueText: '3 / 4'),
        ),
      ],
    );
  }
}

class _Navigation extends StatelessWidget {
  const _Navigation();

  @override
  Widget build(BuildContext context) {
    return ExcludeFocus(
      child: NavigationBar(
        selectedIndex: 1,
        onDestinationSelected: (_) {},
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.today_outlined),
            label: 'Heute',
          ),
          NavigationDestination(
            icon: Icon(Icons.fitness_center),
            label: 'Training',
          ),
          NavigationDestination(
            icon: Icon(Icons.restaurant_outlined),
            label: 'Ernährung',
          ),
          NavigationDestination(
            icon: Icon(Icons.insights_outlined),
            label: 'Fortschritt',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            label: 'Profil',
          ),
        ],
      ),
    );
  }
}

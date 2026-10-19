import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_token_types.dart';
import '../../core/theme/vitruv_tokens.g.dart';

/// Sizes a token text role for the current screen width (fluid, same curve as the web).
TextStyle vitruvTextStyle(
  BuildContext context,
  VitruvTextRole role,
  Color color,
) => role.style(color: color, screenWidth: MediaQuery.sizeOf(context).width);

/// Small uppercase blue label above a title ("TRAINING", "WOCHE 03").
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    VitruvType.eyebrow.apply(text),
    style: vitruvTextStyle(
      context,
      VitruvType.eyebrow,
      VitruvTheme.of(context).accentText,
    ),
  );
}

enum SectionTitleSize { h1, h2, h3 }

/// A screen/section title, exposed to screen readers as a heading.
class SectionTitle extends StatelessWidget {
  const SectionTitle(
    this.text, {
    super.key,
    this.size = SectionTitleSize.h2,
    this.emphasis = false,
  });

  final String text;
  final SectionTitleSize size;

  /// The prototype's italic treatment (stage / call-to-action titles).
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    final role = switch (size) {
      SectionTitleSize.h1 => VitruvType.h1,
      SectionTitleSize.h2 => VitruvType.h2,
      SectionTitleSize.h3 => VitruvType.h3,
    };
    final style = vitruvTextStyle(context, role, VitruvTheme.of(context).fg);
    return Semantics(
      header: true,
      child: Text(
        role.apply(text),
        style: emphasis ? style.copyWith(fontStyle: FontStyle.italic) : style,
        // Headings are already ≥ 2× the body size: they follow the system text size up to 1.5×
        // (body text keeps the full scale), so single long words never break mid-word on phones.
        textScaler: MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.5),
      ),
    );
  }
}

/// Eyebrow + title + optional lead — the standard opening of a screen section.
class SectionIntro extends StatelessWidget {
  const SectionIntro({
    super.key,
    required this.title,
    this.eyebrow,
    this.lead,
    this.size = SectionTitleSize.h2,
    this.emphasis = false,
  });

  final String title;
  final String? eyebrow;
  final String? lead;
  final SectionTitleSize size;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (eyebrow != null) ...[
          Eyebrow(eyebrow!),
          const SizedBox(height: VitruvSpace.s3),
        ],
        SectionTitle(title, size: size, emphasis: emphasis),
        if (lead != null) ...[
          const SizedBox(height: VitruvSpace.s3),
          Text(
            lead!,
            style: vitruvTextStyle(
              context,
              VitruvType.bodyLg,
              VitruvTheme.of(context).fgMuted,
            ),
          ),
        ],
      ],
    );
  }
}

/// Uppercase condensed metadata text ("6 WOCHEN", "TEILNEHMER 01") in the subtle colour.
class MetaLabel extends StatelessWidget {
  const MetaLabel(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text(
    VitruvType.caption.apply(text),
    style: vitruvTextStyle(
      context,
      VitruvType.caption,
      color ?? VitruvTheme.of(context).fgSubtle,
    ),
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:yaqoot/ui.dart';

void main() {
  testWidgets('شعار مكتب سفيان يُرسم بثلاثة أعمدة', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Center(child: BrandMark(size: 100)))));
    expect(find.bySemanticsLabel('مكتب سفيان للموبايل'), findsOneWidget);
  });
}

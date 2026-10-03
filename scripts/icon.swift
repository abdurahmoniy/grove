import AppKit

let size = 1024
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
let context = NSGraphicsContext(bitmapImageRep: bitmap)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high
let plate = NSBezierPath(roundedRect: NSRect(x: 55, y: 55, width: 914, height: 914), xRadius: 209, yRadius: 209)
NSGradient(starting: NSColor(red: 0.21, green: 0.31, blue: 0.24, alpha: 1), ending: NSColor(red: 0.08, green: 0.13, blue: 0.10, alpha: 1))!.draw(in: plate, angle: -60)
NSColor(red: 0.34, green: 0.46, blue: 0.37, alpha: 1).setStroke()
plate.lineWidth = 3
plate.stroke()
let leaf = NSBezierPath()
leaf.move(to: NSPoint(x: 486, y: 266))
leaf.line(to: NSPoint(x: 486, y: 524))
leaf.move(to: NSPoint(x: 486, y: 434))
leaf.curve(to: NSPoint(x: 250, y: 713), controlPoint1: NSPoint(x: 286, y: 426), controlPoint2: NSPoint(x: 233, y: 537))
leaf.curve(to: NSPoint(x: 486, y: 434), controlPoint1: NSPoint(x: 427, y: 713), controlPoint2: NSPoint(x: 506, y: 626))
leaf.move(to: NSPoint(x: 486, y: 538))
leaf.curve(to: NSPoint(x: 773, y: 770), controlPoint1: NSPoint(x: 486, y: 710), controlPoint2: NSPoint(x: 603, y: 791))
leaf.curve(to: NSPoint(x: 486, y: 538), controlPoint1: NSPoint(x: 774, y: 601), controlPoint2: NSPoint(x: 669, y: 518))
leaf.lineWidth = 35
leaf.lineCapStyle = .round
leaf.lineJoinStyle = .round
NSColor(red: 0.70, green: 0.85, blue: 0.74, alpha: 1).setStroke()
leaf.stroke()
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "build/icon.png"))

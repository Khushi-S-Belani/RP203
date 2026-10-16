import Foundation
import Vision
import CoreImage

struct DetectedFace {
    let x: Double
    let y: Double
    let w: Double
    let h: Double
    let gender: String // "male" | "female"
}

func detectFaces(from base64String: String) -> (count: Int, faces: [DetectedFace]) {
    var cleanStr = base64String.trimmingCharacters(in: .whitespacesAndNewlines)
    if let commaIdx = cleanStr.firstIndex(of: ",") {
        cleanStr = String(cleanStr[cleanStr.index(after: commaIdx)...])
    }
    
    guard let data = Data(base64Encoded: cleanStr),
          let ciImage = CIImage(data: data) else {
        return (0, [])
    }
    
    let request = VNDetectFaceLandmarksRequest()
    let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
    
    do {
        try handler.perform([request])
        guard let results = request.results else {
            return (0, [])
        }
        
        let detected = results.prefix(4).map { face -> DetectedFace in
            let box = face.boundingBox
            var estimatedGender = "male"
            
            // Analyze facial geometry and jawline contour if available
            if let landmarks = face.landmarks,
               let contour = landmarks.faceContour {
                let pts = contour.normalizedPoints
                if pts.count >= 6 {
                    // Check jaw tapering (chin width vs cheek width)
                    let leftCheek = pts[0].x
                    let rightCheek = pts[pts.count - 1].x
                    let cheekWidth = abs(rightCheek - leftCheek)
                    
                    let midIdx = pts.count / 2
                    let chinWidth = abs(pts[midIdx + 1].x - pts[midIdx - 1].x)
                    
                    let taperRatio = chinWidth / max(0.01, cheekWidth)
                    // Female faces have softer, more tapered V-jawlines
                    if taperRatio < 0.46 || (box.size.width / max(0.01, box.size.height)) < 0.82 {
                        estimatedGender = "female"
                    }
                }
            } else {
                // Fallback to aspect ratio
                if (box.size.width / max(0.01, box.size.height)) < 0.85 {
                    estimatedGender = "female"
                }
            }
            
            return DetectedFace(
                x: Double(box.origin.x),
                y: Double(box.origin.y),
                w: Double(box.size.width),
                h: Double(box.size.height),
                gender: estimatedGender
            )
        }
        
        // Sort faces left-to-right on screen
        let sorted = detected.sorted { $0.x < $1.x }
        return (sorted.count, sorted)
    } catch {
        return (0, [])
    }
}

// Read base64 from standard input
let input = FileHandle.standardInput.readDataToEndOfFile()
if let str = String(data: input, encoding: .utf8) {
    let result = detectFaces(from: str)
    let count = min(4, result.count)
    let faces = result.faces
    
    var groupType = "solo"
    var emojiStr = "🧑"
    var themeColor = "indigo"
    
    if count == 1 {
        let g = faces.first?.gender ?? "male"
        groupType = g == "female" ? "solo_f" : "solo_m"
        emojiStr = g == "female" ? "👩" : "👨"
        themeColor = g == "female" ? "rose" : "indigo"
    } else if count == 2 {
        let g1 = faces[0].gender
        let g2 = faces[1].gender
        
        if (g1 == "male" && g2 == "female") || (g1 == "female" && g2 == "male") {
            groupType = "couple_mf"
            emojiStr = "👨 👩"
            themeColor = "love" // Romantic Ruby Red / Love Pink
        } else if g1 == "female" && g2 == "female" {
            groupType = "couple_ff"
            emojiStr = "👩 👩"
            themeColor = "bestie" // Cute Blossom Pink / Lavender
        } else {
            groupType = "couple_mm"
            emojiStr = "👨 👨"
            themeColor = "yaari" // Bro / Yaari Electric Blue
        }
    } else if count == 3 {
        groupType = "trio"
        let emojis = faces.map { $0.gender == "female" ? "👩" : "👨" }.joined(separator: " ")
        emojiStr = emojis.isEmpty ? "🧑 🧑 🧑" : emojis
        themeColor = "amber"
    } else if count >= 4 {
        groupType = "squad"
        let emojis = faces.prefix(4).map { $0.gender == "female" ? "👩" : "👨" }.joined(separator: " ")
        emojiStr = emojis.isEmpty ? "🧑 🧑 🧑 🧑" : emojis
        themeColor = "purple"
    }
    
    let faceData = faces.map { [
        "x": $0.x,
        "y": $0.y,
        "w": $0.w,
        "h": $0.h,
        "gender": $0.gender
    ] }
    
    let json: [String: Any] = [
        "count": count,
        "groupType": groupType,
        "emojis": emojiStr,
        "themeColor": themeColor,
        "faces": faceData
    ]
    
    if let jsonData = try? JSONSerialization.data(withJSONObject: json, options: []),
       let jsonStr = String(data: jsonData, encoding: .utf8) {
        print(jsonStr)
    } else {
        print("{\"count\":0,\"groupType\":\"solo\",\"emojis\":\"🧑\",\"themeColor\":\"indigo\",\"faces\":[]}")
    }
} else {
    print("{\"count\":0,\"groupType\":\"solo\",\"emojis\":\"🧑\",\"themeColor\":\"indigo\",\"faces\":[]}")
}

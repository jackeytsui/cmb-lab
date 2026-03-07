import React from "react";
import path from "path";
import {
  Document,
  Page,
  View,
  Text,
  Font,
  StyleSheet,
} from "@react-pdf/renderer";

// Register Inter variable font (Latin text)
Font.register({
  family: "Inter",
  fonts: [
    {
      src: path.join(process.cwd(), "public/fonts/Inter-Regular.ttf"),
      fontWeight: 400,
    },
    {
      src: path.join(process.cwd(), "public/fonts/Inter-Regular.ttf"),
      fontWeight: 700,
    },
  ],
});

// Register Noto Sans SC variable font (CJK characters)
Font.register({
  family: "NotoSansSC",
  fonts: [
    {
      src: path.join(process.cwd(), "public/fonts/NotoSansSC-Regular.ttf"),
      fontWeight: 400,
    },
    {
      src: path.join(process.cwd(), "public/fonts/NotoSansSC-Regular.ttf"),
      fontWeight: 700,
    },
  ],
});

// Disable hyphenation for cleaner text rendering
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 50,
    backgroundColor: "#FFFFFF",
    fontFamily: "Inter",
  },
  outerBorder: {
    width: "100%",
    height: "100%",
    border: "3pt solid #1a365d",
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  innerBorder: {
    width: "100%",
    height: "100%",
    border: "1pt solid #2b6cb0",
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    fontSize: 32,
    fontWeight: 700,
    color: "#1a365d",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  divider: {
    width: 120,
    height: 2,
    backgroundColor: "#2b6cb0",
    marginVertical: 16,
  },
  certifiesText: {
    fontSize: 14,
    color: "#4a5568",
    marginBottom: 12,
    textAlign: "center",
  },
  studentName: {
    fontSize: 28,
    fontWeight: 700,
    color: "#2d3748",
    marginBottom: 12,
    textAlign: "center",
    fontFamily: "NotoSansSC",
  },
  completedText: {
    fontSize: 14,
    color: "#4a5568",
    marginBottom: 12,
    textAlign: "center",
  },
  courseTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#1a365d",
    marginBottom: 24,
    textAlign: "center",
    fontFamily: "NotoSansSC",
  },
  dateText: {
    fontSize: 12,
    color: "#718096",
    marginBottom: 4,
    textAlign: "center",
  },
  verificationText: {
    fontSize: 9,
    color: "#a0aec0",
    marginTop: 24,
    textAlign: "center",
  },
});

interface CertificateDocumentProps {
  studentName: string;
  courseTitle: string;
  completedAt: Date;
  verificationId: string;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function CertificateDocument({
  studentName,
  courseTitle,
  completedAt,
  verificationId,
}: CertificateDocumentProps) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.outerBorder}>
          <View style={styles.innerBorder}>
            <Text style={styles.header}>Certificate of Completion</Text>
            <View style={styles.divider} />
            <Text style={styles.certifiesText}>This certifies that</Text>
            <Text style={styles.studentName}>{studentName}</Text>
            <Text style={styles.completedText}>
              has successfully completed
            </Text>
            <Text style={styles.courseTitle}>{courseTitle}</Text>
            <View style={styles.divider} />
            <Text style={styles.dateText}>{formatDate(completedAt)}</Text>
            <Text style={styles.verificationText}>
              Verify at: /verify/{verificationId}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

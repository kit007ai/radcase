class ReportParser {
  parse(reportText) {
    const sections = {
      exam: '',
      clinical_history: '',
      comparison: '',
      technique: '',
      findings: '',
      impression: '',
      raw: reportText
    };

    const sectionPatterns = [
      { key: 'exam', patterns: [/(?:EXAM|PROCEDURE|EXAMINATION|STUDY)[:\s-]+/i] },
      { key: 'clinical_history', patterns: [/(?:CLINICAL (?:HISTORY|INDICATION|INFO)|INDICATION|HISTORY|REASON FOR (?:EXAM|STUDY))[:\s-]+/i] },
      { key: 'comparison', patterns: [/(?:COMPARISON|PRIOR|PREVIOUS)[:\s-]+/i] },
      { key: 'technique', patterns: [/(?:TECHNIQUE|PROTOCOL)[:\s-]+/i] },
      { key: 'findings', patterns: [/(?:FINDINGS|BODY OF REPORT|DESCRIPTION)[:\s-]+/i] },
      { key: 'impression', patterns: [/(?:IMPRESSION|CONCLUSION|SUMMARY|DIAGNOSIS|INTERPRETATION)[:\s-]+/i] }
    ];

    // Find all section header positions
    const headerPositions = [];
    for (const section of sectionPatterns) {
      for (const pattern of section.patterns) {
        const match = pattern.exec(reportText);
        if (match) {
          headerPositions.push({
            key: section.key,
            start: match.index,
            contentStart: match.index + match[0].length
          });
          break; // Use first matching pattern for this section
        }
      }
    }

    // Sort by position in the text
    headerPositions.sort((a, b) => a.start - b.start);

    // Extract text between headers
    for (let i = 0; i < headerPositions.length; i++) {
      const current = headerPositions[i];
      const next = headerPositions[i + 1];
      const endPos = next ? next.start : reportText.length;
      sections[current.key] = reportText.substring(current.contentStart, endPos).trim();
    }

    // If no sections were found, try to use the full text as findings
    if (headerPositions.length === 0 && reportText.trim()) {
      sections.findings = reportText.trim();
    }

    return sections;
  }

  extractModality(reportText, dicomMetadata) {
    if (dicomMetadata && dicomMetadata.modality) {
      return dicomMetadata.modality;
    }

    const text = reportText.toUpperCase();
    const modalityPatterns = [
      { modality: 'MRI', patterns: [/\bMRI\b/, /\bMR\b/, /\bMAGNETIC RESONANCE\b/] },
      { modality: 'CT', patterns: [/\bCT\b/, /\bCOMPUTED TOMOGRAPHY\b/, /\bCAT SCAN\b/] },
      { modality: 'X-Ray', patterns: [/\bX-RAY\b/, /\bXR\b/, /\bRADIOGRAPH\b/, /\bPLAIN FILM\b/] },
      { modality: 'Ultrasound', patterns: [/\bULTRASOUND\b/, /\bUS\b/, /\bSONOGRA/] },
      { modality: 'Nuclear Medicine', patterns: [/\bNUCLEAR\b/, /\bPET\b/, /\bSCINTIGRAPHY\b/] },
      { modality: 'Fluoroscopy', patterns: [/\bFLUORO/, /\bBARIUM\b/, /\bSWALLOW STUDY\b/] },
      { modality: 'Mammography', patterns: [/\bMAMMO/, /\bBREAST IMAGING\b/] },
      { modality: 'Angiography', patterns: [/\bANGIOGRA/, /\bDSA\b/, /\bCATHETER\b/] }
    ];

    for (const { modality, patterns } of modalityPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return modality;
        }
      }
    }

    return '';
  }

  extractBodyPart(reportText, dicomMetadata) {
    if (dicomMetadata && dicomMetadata.bodyPart) {
      return dicomMetadata.bodyPart;
    }

    const text = reportText.toUpperCase();
    const bodyPartPatterns = [
      { bodyPart: 'Head', patterns: [/\bHEAD\b/, /\bBRAIN\b/, /\bCRANI/] },
      { bodyPart: 'Chest', patterns: [/\bCHEST\b/, /\bTHORAX\b/, /\bTHORAC/, /\bLUNG\b/, /\bPULMONARY\b/] },
      { bodyPart: 'Abdomen', patterns: [/\bABDOMEN\b/, /\bABDOMIN/, /\bLIVER\b/, /\bPANCREA/, /\bKIDNEY\b/, /\bRENAL\b/] },
      { bodyPart: 'Pelvis', patterns: [/\bPELVI/, /\bBLADDER\b/, /\bUTER/, /\bOVAR/] },
      { bodyPart: 'Spine', patterns: [/\bSPINE\b/, /\bSPINAL\b/, /\bCERVICAL\b/, /\bTHORACIC SPINE\b/, /\bLUMBAR\b/, /\bSACR/] },
      { bodyPart: 'MSK', patterns: [/\bMUSCULOSKELET/, /\bSHOULDER\b/, /\bKNEE\b/, /\bHIP\b/, /\bANKLE\b/, /\bWRIST\b/, /\bELBOW\b/, /\bFOOT\b/, /\bHAND\b/] },
      { bodyPart: 'Neck', patterns: [/\bNECK\b/, /\bTHYROID\b/, /\bPARATHYROID\b/] },
      { bodyPart: 'Cardiac', patterns: [/\bCARDIAC\b/, /\bHEART\b/, /\bCORONARY\b/] },
      { bodyPart: 'Breast', patterns: [/\bBREAST\b/, /\bMAMMO/] },
      { bodyPart: 'Vascular', patterns: [/\bVASCULAR\b/, /\bAORT/, /\bARTER/, /\bVEN(?:OUS|A)\b/] }
    ];

    for (const { bodyPart, patterns } of bodyPartPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return bodyPart;
        }
      }
    }

    return '';
  }
}

module.exports = ReportParser;

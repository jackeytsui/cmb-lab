import Link from "next/link";

export const metadata = {
  title: "Terms and Conditions - CantoMando",
};

export default function TermsAndConditionsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Terms and Conditions</h1>
      </div>

      <div className="space-y-4 text-sm leading-6 text-foreground">
        <p>
          These Terms and Conditions ("Terms") govern access to and use of the Canto Mando Lab
          platform (the "Platform"), operated by Cantomando Media LTD. ("Company", "we", "us",
          or "our"). By using the Platform, you agree to these Terms.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">1. Access and Eligibility</h2>
          <p>
            Access to the Platform is controlled by the Company and may be granted, restricted,
            suspended, or revoked at our discretion. Users must use an authorized email address
            and comply with all applicable policies and laws.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">2. Fees, Plan Scope, and Change of Access</h2>
          <p>
            The Platform is not a free tool or free add-on included in previously purchased
            student plans. If access is provided, such access does not mean the Platform is
            included in any plan a student has already paid for.
          </p>
          <p>
            Access rules, billing model, and payment requirements for this Platform are subject to
            change at any time, with or without prior notice where permitted by applicable law.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">3. Intellectual Property and Third-Party Content</h2>
          <p>
            We respect the rights of creators and content owners. Third-party content (including
            but not limited to YouTube videos and channels) remains the property of its respective
            owners.
          </p>
          <p>
            Where applicable, creator names and source channels should remain visible. Users must
            not remove attribution, misrepresent ownership, or use third-party content in a way
            that violates copyright, licensing terms, or platform rules.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">4. Acceptable Use</h2>
          <p>
            You agree not to misuse the Platform, including by attempting unauthorized access,
            scraping restricted data, interfering with system integrity, or using the Platform for
            unlawful activity.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">5. Service Availability</h2>
          <p>
            The Platform may be in beta, experimental, or evolving form. Features, workflows, and
            availability may change without guarantee of uninterrupted operation.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Cantomando Media LTD. is not liable for
            indirect, incidental, special, consequential, or punitive damages arising from use of
            or inability to use the Platform.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">7. Updates and Interpretation</h2>
          <p>
            Cantomando Media LTD. may update these Terms from time to time. Continued use of the
            Platform after updates constitutes acceptance of the revised Terms.
          </p>
          <p>
            Cantomando Media LTD. has the final right to interpret these Terms and Conditions.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">8. Contact</h2>
          <p>
            For questions about these Terms and Conditions, contact us at{" "}
            <a className="underline underline-offset-2" href="mailto:contact@thecmblueprint.com">
              contact@thecmblueprint.com
            </a>
            .
          </p>
        </section>
      </div>

      <div className="mt-8">
        <Link
          href="/settings"
          className="inline-flex rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Back to Settings
        </Link>
      </div>
    </div>
  );
}

import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Main } from '@/components/elements/main'
import { GitHubIcon } from '@/components/icons/social/github-icon'
import { XIcon } from '@/components/icons/social/x-icon'
import { YouTubeIcon } from '@/components/icons/social/youtube-icon'
import { DocumentCentered } from '@/components/sections/document-centered'
import {
  FooterCategory,
  FooterLink,
  FooterWithNewsletterFormCategoriesAndSocialIcons,
  NewsletterForm,
  SocialLink,
} from '@/components/sections/footer-with-newsletter-form-categories-and-social-icons'
import {
  NavbarLink,
  NavbarLogo,
  NavbarWithLinksActionsAndCenteredLogo,
} from '@/components/sections/navbar-with-links-actions-and-centered-logo'

export default function Page() {
  return (
    <>
      <NavbarWithLinksActionsAndCenteredLogo
        id="navbar"
        links={
          <>
            <NavbarLink href="#">Pricing</NavbarLink>
            <NavbarLink href="#">About</NavbarLink>
            <NavbarLink href="#">Docs</NavbarLink>
            <NavbarLink href="#" className="sm:hidden">
              Log in
            </NavbarLink>
          </>
        }
        logo={
          <NavbarLogo href="#">
            <img
              src="https://assets.tailwindplus.com/logos/oatmeal-mona.svg?color=mist-950"
              alt="Oatmeal"
              className="dark:hidden"
              width={113}
              height={28}
            />
            <img
              src="https://assets.tailwindplus.com/logos/oatmeal-mona.svg?color=white"
              alt="Oatmeal"
              className="not-dark:hidden"
              width={113}
              height={28}
            />
          </NavbarLogo>
        }
        actions={
          <>
            <PlainButtonLink href="#" className="max-sm:hidden">
              Log in
            </PlainButtonLink>
            <ButtonLink href="#">Get started</ButtonLink>
          </>
        }
      />

      <Main>
        <DocumentCentered
          id="document"
          headline="Privacy Policy"
          subheadline={<p>Last updated on December 19, 2025.</p>}
        >
          <p>
            Company Inc. ("<strong>Company</strong>," "<strong>we</strong>," "<strong>us</strong>
            ," or "<strong>our</strong>") respects your privacy and is committed to protecting your personal
            information. This Privacy Policy describes, in general terms, how we collect, use, store, and protect
            information when you interact with our websites, products, or services (collectively, the "
            <strong>Services</strong>"). This policy is provided for informational purposes and is intended to be a
            general example only.
          </p>
          <h2>Information We Collect and How We Use It</h2>
          <p>
            We may collect information that you voluntarily provide to us when you interact with the Services, such as
            when you contact us, create an account, or otherwise communicate with us. This information may include basic
            personal or account details, such as your name, email address, or similar contact information.
          </p>
          <p>
            We may also automatically collect limited technical or usage information when you use the Services. This may
            include information such as browser type, device or operating system details, IP address, and general usage
            data.
          </p>
          <p>Information we collect may be used for purposes such as:</p>
          <ul>
            <li>Providing and maintaining the Services</li>
            <li>Responding to inquiries and communications</li>
            <li>Improving features and functionality</li>
            <li>Complying with applicable legal obligations</li>
          </ul>
          <h2>Sharing, Retention, and Security of Information</h2>
          <p>
            We do not sell your personal information. We may share information with third-party service providers who
            perform services on our behalf, such as hosting or technical support, and only to the extent necessary for
            them to perform those services. We may also disclose information if required to do so by law or in response
            to valid legal requests.
          </p>
          <p>
            We retain information only for as long as reasonably necessary to fulfill the purposes described in this
            Privacy Policy, unless a longer retention period is required or permitted by law.
          </p>
          <p>
            We take reasonable administrative, technical, and organizational measures designed to protect information
            from unauthorized access, use, alteration, or disclosure. However, no method of transmission over the
            internet or method of electronic storage is completely secure, and we cannot guarantee absolute security.
          </p>
          <h2>Your Choices, Updates, and Contact Information</h2>
          <p>
            You may choose not to provide certain information to us, though doing so may limit your ability to use some
            features of the Services. Depending on your location, you may have certain rights regarding your personal
            information under applicable laws.
          </p>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be reflected by updating the "
            <strong>Last updated</strong>" date at the top of this page. Continued use of the Services after any changes
            indicates acceptance of the updated policy.
          </p>
          <p>If you have any questions about this Privacy Policy, please contact us at:</p>
          <p>
            <strong>Company Inc.</strong>
            <br />
            Email: <a href="mailto:privacy@company.example">privacy@company.example</a>
            <br />
            Address: 123 Demo Street, Example City, Country
          </p>
        </DocumentCentered>
      </Main>

      <FooterWithNewsletterFormCategoriesAndSocialIcons
        id="footer"
        cta={
          <NewsletterForm
            headline="Stay in the loop"
            subheadline={
              <p>
                Get customer support tips, product updates and customer stories that you can archive as soon as they
                arrive.
              </p>
            }
            action="#"
          />
        }
        links={
          <>
            <FooterCategory title="Product">
              <FooterLink href="#">Features</FooterLink>
              <FooterLink href="#">Pricing</FooterLink>
              <FooterLink href="#">Integrations</FooterLink>
            </FooterCategory>
            <FooterCategory title="Company">
              <FooterLink href="#">About</FooterLink>
              <FooterLink href="#">Careers</FooterLink>
              <FooterLink href="#">Blog</FooterLink>
              <FooterLink href="#">Press Kit</FooterLink>
            </FooterCategory>
            <FooterCategory title="Resources">
              <FooterLink href="#">Help Center</FooterLink>
              <FooterLink href="#">API Docs</FooterLink>
              <FooterLink href="#">Status</FooterLink>
              <FooterLink href="#">Contact</FooterLink>
            </FooterCategory>
            <FooterCategory title="Legal">
              <FooterLink href="#">Privacy Policy</FooterLink>
              <FooterLink href="#">Terms of Service</FooterLink>
              <FooterLink href="#">Security</FooterLink>
            </FooterCategory>
          </>
        }
        fineprint="© 2025 Oatmeal, Inc."
        socialLinks={
          <>
            <SocialLink href="https://x.com" name="X">
              <XIcon />
            </SocialLink>
            <SocialLink href="https://github.com" name="GitHub">
              <GitHubIcon />
            </SocialLink>
            <SocialLink href="https://www.youtube.com" name="YouTube">
              <YouTubeIcon />
            </SocialLink>
          </>
        }
      />
    </>
  )
}

import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Main } from '@/components/elements/main'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { FAQsAccordion, Faq } from '@/components/sections/faqs-accordion'
import { FooterCategory, FooterLink, FooterWithLinkCategories } from '@/components/sections/footer-with-link-categories'
import {
  NavbarLink,
  NavbarLogo,
  NavbarWithLogoActionsAndCenteredLinks,
} from '@/components/sections/navbar-with-logo-actions-and-centered-links'
import { PricingSingleTierTwoColumn } from '@/components/sections/pricing-single-tier-two-column'
import { TestimonialLargeQuote } from '@/components/sections/testimonial-with-large-quote'
import { Example as Hero } from '@/examples/hero-simple-centered-pricing'

export default function Page() {
  return (
    <>
      <NavbarWithLogoActionsAndCenteredLinks
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
        {/* Hero */}
        <Hero />

        {/* Pricing */}
        <PricingSingleTierTwoColumn
          id="pricing"
          headline="No setup fees. No contracts. Cancel anytime."
          subheadline={
            <p>Commitment free, because we are banking on the fact that you'll forget that you're even paying us.</p>
          }
          price="$49"
          period="/mo"
          features={[
            'Unlimited mailboxes',
            'Unlimited team members',
            'Inbox Agent',
            'Collision detection',
            'Snippets and templates',
            'Reporting dashboard',
            'Slack integration',
          ]}
          cta={
            <ButtonLink href="#" size="lg">
              Start free trial
            </ButtonLink>
          }
        />

        {/* Testimonial */}
        <TestimonialLargeQuote
          id="testimonial"
          quote={
            <p>
              Oatmeal has completely transformed our customer support operations. The blend of AI efficiency and human
              empathy has allowed us to provide exceptional service while significantly reducing costs.
            </p>
          }
          img={
            <img
              src="https://assets.tailwindplus.com/avatars/10.webp?size=160"
              alt=""
              className="not-dark:bg-white/75 dark:bg-black/75"
              width={160}
              height={160}
            />
          }
          name="Jordan Rogers"
          byline="Founder at Anomaly"
        />

        {/* FAQs */}
        <FAQsAccordion id="faqs" headline="Questions & Answers">
          <Faq
            id="faq-1"
            question="Do I need a credit card to start the free trial?"
            answer="Yes, but don't worry, you won't be charged until the trial period is over. We won't send you an email reminding you when this happens because we are really hoping you'll forget and we can keep charging you until your cards expires"
          />
          <Faq
            id="faq-2"
            question="Can my whole team use the same inbox?"
            answer="Yes, the more the merrier! Oatmeal works best when your entire company has access. We will charge you per additional seat, but we won't tell you about this until you get your invoice."
          />
          <Faq
            id="faq-3"
            question="Is the AI agent actually a bunch of people in India?"
            answer="Not just India! We have people in lots of countries around the world pretending to be an AI, including some that are currently under sanctions, so we can't legally mention them here."
          />
          <Faq
            id="faq-4"
            question="Does Oatmeal replace my email client?"
            answer="Absolutely. The idea is that we transition you away from email entirely, so you become completely dependent on our service. Like a parasite living off a host."
          />
        </FAQsAccordion>

        {/* Call To Action */}
        <CallToActionSimpleCentered
          id="call-to-action"
          headline="Have anymore questions?"
          subheadline={
            <p>Chat to someone on our sales team, who will make promises about our roadmap that we won't keep.</p>
          }
          cta={
            <div className="flex items-center gap-4">
              <ButtonLink href="#" size="lg">
                Chat with us
              </ButtonLink>

              <PlainButtonLink href="#" size="lg">
                Book a demo <ChevronIcon />
              </PlainButtonLink>
            </div>
          }
        />
      </Main>

      <FooterWithLinkCategories
        id="footer"
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
            <FooterCategory title="Connect">
              <FooterLink href="#">X</FooterLink>
              <FooterLink href="#">GitHub</FooterLink>
              <FooterLink href="#">YouTube</FooterLink>
            </FooterCategory>
          </>
        }
        fineprint="© 2025 Oatmeal, Inc."
      />
    </>
  )
}

import { ButtonLink, PlainButtonLink, SoftButtonLink } from '@/components/elements/button'
import { Logo, LogoGrid } from '@/components/elements/logo-grid'
import { Main } from '@/components/elements/main'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { GitHubIcon } from '@/components/icons/social/github-icon'
import { XIcon } from '@/components/icons/social/x-icon'
import { YouTubeIcon } from '@/components/icons/social/youtube-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { FAQsAccordion, Faq } from '@/components/sections/faqs-accordion'
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
import { PlanComparisonTable } from '@/components/sections/plan-comparison-table'
import { Plan, PricingHeroMultiTier } from '@/components/sections/pricing-hero-multi-tier'
import { TestimonialTwoColumnWithLargePhoto } from '@/components/sections/testimonial-two-column-with-large-photo'

function plans(option: string) {
  return (
    <>
      <Plan
        name="Starter"
        price={option === 'Monthly' ? '$12' : '$120'}
        period={option === 'Monthly' ? '/month' : '/year'}
        subheadline={<p>Small teams getting started with shared inboxes</p>}
        features={[
          'Shared inbox for up to 2 mailboxes',
          'Tagging & assignment',
          'Private notes',
          'Automatic replies',
          'Email support',
        ]}
        cta={
          <SoftButtonLink href="#" size="lg">
            Start free trial
          </SoftButtonLink>
        }
      />
      <Plan
        name="Growth"
        price={option === 'Monthly' ? '$49' : '$490'}
        period={option === 'Monthly' ? '/month' : '/year'}
        subheadline={<p>Growing teams needing collaboration and insights</p>}
        badge="Most popular"
        features={[
          'Everything in Starter',
          'Inbox Agent',
          'Unlimited mailboxes',
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
      <Plan
        name="Pro"
        price={option === 'Monthly' ? '$299' : '$2990'}
        period={option === 'Monthly' ? '/month' : '/year'}
        subheadline={<p>Support-focused organizations and larger teams</p>}
        features={[
          'Everything in Growth',
          'Custom roles & permissions',
          'Automation engine',
          'API access',
          'SLA tracking',
          'SSO support',
          'SOC 2 compliance',
        ]}
        cta={
          <SoftButtonLink href="#" size="lg">
            Start free trial
          </SoftButtonLink>
        }
      />
    </>
  )
}

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
        {/* Hero */}
        <PricingHeroMultiTier
          id="pricing"
          headline="Pricing"
          subheadline={
            <p>
              Simplify your shared inbox, collaborate effortlessly, and give every customer a reply that feels personal,
              even if it was written by a bot.
            </p>
          }
          options={['Monthly', 'Yearly']}
          plans={{ Monthly: plans('Monthly'), Yearly: plans('Yearly') }}
          footer={
            <LogoGrid>
              <Logo>
                <img
                  src="https://assets.tailwindplus.com/logos/9.svg?color=black&height=32"
                  className="dark:hidden"
                  alt=""
                  width={51}
                  height={32}
                />
                <img
                  src="https://assets.tailwindplus.com/logos/9.svg?color=white&height=32"
                  className="not-dark:hidden"
                  alt=""
                  width={51}
                  height={32}
                />
              </Logo>
              <Logo>
                <img
                  src="https://assets.tailwindplus.com/logos/10.svg?color=black&height=32"
                  className="dark:hidden"
                  alt=""
                  width={70}
                  height={32}
                />
                <img
                  src="https://assets.tailwindplus.com/logos/10.svg?color=white&height=32"
                  className="not-dark:hidden"
                  alt=""
                  width={70}
                  height={32}
                />
              </Logo>
              <Logo>
                <img
                  src="https://assets.tailwindplus.com/logos/11.svg?color=black&height=32"
                  className="dark:hidden"
                  alt=""
                  width={100}
                  height={32}
                />
                <img
                  src="https://assets.tailwindplus.com/logos/11.svg?color=white&height=32"
                  className="not-dark:hidden"
                  alt=""
                  width={100}
                  height={32}
                />
              </Logo>
              <Logo>
                <img
                  src="https://assets.tailwindplus.com/logos/12.svg?color=black&height=32"
                  className="dark:hidden"
                  alt=""
                  width={85}
                  height={32}
                />
                <img
                  src="https://assets.tailwindplus.com/logos/12.svg?color=white&height=32"
                  className="not-dark:hidden"
                  alt=""
                  width={85}
                  height={32}
                />
              </Logo>
              <Logo>
                <img
                  src="https://assets.tailwindplus.com/logos/13.svg?color=black&height=32"
                  className="dark:hidden"
                  alt=""
                  width={75}
                  height={32}
                />
                <img
                  src="https://assets.tailwindplus.com/logos/13.svg?color=white&height=32"
                  className="not-dark:hidden"
                  alt=""
                  width={75}
                  height={32}
                />
              </Logo>
              <Logo>
                <img
                  src="https://assets.tailwindplus.com/logos/8.svg?color=black&height=32"
                  className="dark:hidden"
                  alt=""
                  width={85}
                  height={32}
                />
                <img
                  src="https://assets.tailwindplus.com/logos/8.svg?color=white&height=32"
                  className="not-dark:hidden"
                  alt=""
                  width={85}
                  height={32}
                />
              </Logo>
            </LogoGrid>
          }
        />

        {/* Plan Comparison Table */}
        <PlanComparisonTable
          id="pricing"
          plans={['Starter', 'Growth', 'Pro']}
          features={[
            {
              title: 'Collaboration',
              features: [
                {
                  name: 'Shared inboxes',
                  value: { Starter: '2', Growth: 'Unlimited', Pro: 'Unlimited' },
                },
                { name: 'Private notes', value: true },
                { name: 'Tagging & assignment', value: true },
                {
                  name: 'Collision detection',
                  value: { Starter: false, Growth: true, Pro: true },
                },
                {
                  name: 'Real-time activity indicators',
                  value: { Starter: false, Growth: true, Pro: true },
                },
                {
                  name: 'Internal chat',
                  value: { Starter: false, Growth: true, Pro: true },
                },
              ],
            },
            {
              title: 'Automation',
              features: [
                { name: 'Automatic replies', value: true },
                {
                  name: 'Inbox Agent',
                  value: { Starter: false, Growth: true, Pro: true },
                },
                {
                  name: 'Automation engine',
                  value: { Starter: false, Growth: true, Pro: true },
                },
                {
                  name: 'Snippets and templates',
                  value: { Starter: false, Growth: true, Pro: true },
                },
                {
                  name: 'SLA tracking',
                  value: { Starter: false, Growth: false, Pro: true },
                },
              ],
            },
            {
              title: 'Team Management',
              features: [
                {
                  name: 'Unlimited users',
                  value: { Starter: 'Up to 5', Growth: true, Pro: true },
                },
                {
                  name: 'Reporting dashboard',
                  value: { Starter: false, Growth: true, Pro: true },
                },
                {
                  name: 'Slack integration',
                  value: { Starter: false, Growth: true, Pro: true },
                },
                {
                  name: 'Roles & permissions',
                  value: { Starter: false, Growth: false, Pro: true },
                },
                {
                  name: 'SSO support',
                  value: { Starter: false, Growth: false, Pro: true },
                },
              ],
            },
            {
              title: 'Support',
              features: [
                { name: 'Email support', value: true },
                {
                  name: 'Priority response',
                  value: { Starter: false, Growth: true, Pro: true },
                },
                {
                  name: 'Dedicated manager',
                  value: { Starter: false, Growth: false, Pro: true },
                },
              ],
            },
          ]}
        />

        {/* Testimonial */}
        <TestimonialTwoColumnWithLargePhoto
          id="testimonial"
          quote={
            <p>
              Ever since we started using Oatmeal, our customer satisfaction scores have skyrocketed. The personal touch
              that their human-AI hybrid support provides is unparalleled.
            </p>
          }
          img={
            <img
              src="https://assets.tailwindplus.com/avatars/16.webp?w=1400&h=1000"
              alt=""
              className="not-dark:bg-white/75 dark:bg-black/75"
              width={1400}
              height={1000}
            />
          }
          name="Lynn Marshall"
          byline="Founder at Pine Labs"
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

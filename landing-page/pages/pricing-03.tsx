import { ButtonLink, PlainButtonLink, SoftButtonLink } from '@/components/elements/button'
import { Main } from '@/components/elements/main'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import { FAQsTwoColumnAccordion, Faq } from '@/components/sections/faqs-two-column-accordion'
import { FooterCategory, FooterLink, FooterWithLinkCategories } from '@/components/sections/footer-with-link-categories'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import {
  NavbarLink,
  NavbarLogo,
  NavbarWithLogoActionsAndCenteredLinks,
} from '@/components/sections/navbar-with-logo-actions-and-centered-links'
import { Plan, PricingMultiTier } from '@/components/sections/pricing-multi-tier'
import { Testimonial, TestimonialThreeColumnGrid } from '@/components/sections/testimonials-three-column-grid'

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
        <HeroSimpleCentered
          id="hero"
          headline="Pricing."
          subheadline={
            <p>
              Simplify your shared inbox, collaborate effortlessly, and give every customer a reply that feels personal,
              even if it was written by a bot.
            </p>
          }
        />

        {/* Individual Plans */}
        <PricingMultiTier
          id="pricing-individual"
          headline="Individual plans"
          plans={
            <>
              <Plan
                name="Hobby"
                price="Free"
                subheadline={<p>Individuals getting started with shared inboxes</p>}
                features={['One inbox', 'Private notes', 'Tagging & assignment', 'Email support']}
                cta={
                  <SoftButtonLink href="#" size="lg">
                    Start free trial
                  </SoftButtonLink>
                }
              />
              <Plan
                name="Growth"
                price="$29"
                period="/mo"
                subheadline={<p>Growing teams needing collaboration and insights</p>}
                badge="Most popular"
                features={[
                  'Everything in Hobby',
                  'Two inboxes',
                  'Automatic replies',
                  'Collision detection',
                  'Snippets and templates',
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
                price="$49"
                period="/mo"
                subheadline={<p>Support-focused organizations and larger teams</p>}
                features={[
                  'Everything in Growth',
                  'Unlimited mailboxes',
                  'Automation engine',
                  'Reporting dashboard',
                  'API access',
                ]}
                cta={
                  <SoftButtonLink href="#" size="lg">
                    Start free trial
                  </SoftButtonLink>
                }
              />
            </>
          }
        />

        {/* Business Plans */}
        <PricingMultiTier
          id="pricing-business"
          headline="Business plans"
          plans={
            <>
              <Plan
                name="Startup"
                price="$149"
                period="/mo"
                subheadline={<p>Growing teams needing collaboration and insights</p>}
                features={[
                  'Everything in Pro',
                  'Shared inboxes',
                  'Custom roles & permissions',
                  'Centralized team billing',
                ]}
                cta={
                  <SoftButtonLink href="#" size="lg">
                    Start free trial
                  </SoftButtonLink>
                }
              />
              <Plan
                name="Enterprise"
                price="Custom"
                subheadline={<p>Support-focused organizations and larger teams</p>}
                features={['Everything in Startup', 'SLA tracking', 'SSO support', 'SOC 2 compliance']}
                cta={
                  <SoftButtonLink href="#" size="lg">
                    Contact sales
                  </SoftButtonLink>
                }
              />
            </>
          }
        />

        {/* Testimonial */}
        <TestimonialThreeColumnGrid
          id="testimonial"
          headline="What our customers are saying"
          subheadline={<p>We've given these customers a significant discount in exchange for their honest reviews.</p>}
        >
          <Testimonial
            quote={
              <p>
                Oatmeal has completely transformed our customer support operations. To be fair, we weren't doing any
                customer support at all so the bar was pretty low.
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
          <Testimonial
            quote={
              <p>
                We use Oatmeal's automation features to make cancellation requests disappear into a black hole,
                improving our retention rates by over 300%.
              </p>
            }
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/15.webp?size=160"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={160}
                height={160}
              />
            }
            name="Lynn Marshall"
            byline="Founder at Pine Labs"
          />
          <Testimonial
            quote={
              <p>
                I've been using the spare time that Oatmeal has freed up to work not just one, but two other jobs, all
                while hitting my core KPIs. My bosses have no idea.
              </p>
            }
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/13.webp?size=160"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={160}
                height={160}
              />
            }
            name="Rajat Singh"
            byline="Head of Support at Concise"
          />
          <Testimonial
            quote={
              <p>
                Oatmeal has given us key insights into how much our customers absolutely hate using our product and how
                we can improve it to stop them from leaving us.
              </p>
            }
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/12.webp?size=160"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={160}
                height={160}
              />
            }
            name="John Walters"
            byline="CPO at Orbital"
          />
          <Testimonial
            quote={
              <p>
                As a solo founder, Oatmeal has been a lifesaver. It makes it look like Looply is an actual company with
                multiple employees, when in reality it's just me and an AI.
              </p>
            }
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/11.webp?size=160"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={160}
                height={160}
              />
            }
            name="Noah Gold"
            byline="CEO at Looply"
          />
          <Testimonial
            quote={
              <p>
                Thanks to Oatmeal, we've managed to cut our support costs in half by laying off dozens of employees,
                while still improving response times and customer satisfaction.
              </p>
            }
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/14.webp?size=160"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={160}
                height={160}
              />
            }
            name="Mark Levinson"
            byline="COO at Quirk"
          />
        </TestimonialThreeColumnGrid>

        {/* FAQs */}
        <FAQsTwoColumnAccordion id="faqs" headline="Questions & Answers">
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
        </FAQsTwoColumnAccordion>

        {/* Call To Action */}
        <CallToActionSimple
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

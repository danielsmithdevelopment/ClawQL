import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Main } from '@/components/elements/main'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { GitHubIcon } from '@/components/icons/social/github-icon'
import { XIcon } from '@/components/icons/social/x-icon'
import { YouTubeIcon } from '@/components/icons/social/youtube-icon'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import {
  FooterCategory,
  FooterLink,
  FooterWithNewsletterFormCategoriesAndSocialIcons,
  NewsletterForm,
  SocialLink,
} from '@/components/sections/footer-with-newsletter-form-categories-and-social-icons'
import { HeroLeftAlignedWithPhoto } from '@/components/sections/hero-left-aligned-with-photo'
import {
  NavbarLink,
  NavbarLogo,
  NavbarWithLinksActionsAndCenteredLogo,
} from '@/components/sections/navbar-with-links-actions-and-centered-logo'
import { Stat, StatsWithGraph } from '@/components/sections/stats-with-graph'
import { TeamFourColumnGrid, TeamMember } from '@/components/sections/team-four-column-grid'
import { TestimonialTwoColumnWithLargePhoto } from '@/components/sections/testimonial-two-column-with-large-photo'

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
        <HeroLeftAlignedWithPhoto
          id="hero"
          headline="Your customer success is our mission."
          subheadline={
            <p>
              We're on a mission to take the human element completely out of customer support — so your team can focus
              on what matters most, profitability.
            </p>
          }
          photo={
            <img
              src="https://assets.tailwindplus.com/photos/1.webp"
              alt=""
              width={1800}
              height={945}
              className="not-dark:bg-white/75 dark:bg-black/75"
            />
          }
        />

        {/* Stats */}
        <StatsWithGraph
          id="stats"
          eyebrow="Built for scale"
          headline="The inbox powering customer conversations everywhere."
          subheadline={
            <p>
              Oatmeal helps teams deliver personal, organized, and fast customer support across the world. From small
              startups to enterprise teams, we process millions of messages each month — using a massive network of low
              wage workers stationed around the globe.
            </p>
          }
        >
          <Stat stat="2M+" text="Emails manually processed every week across thousands of teams." />
          <Stat stat="99.98%" text="Uptime — because your customers never stop complaining." />
        </StatsWithGraph>

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

        {/* Team */}
        <TeamFourColumnGrid
          id="team"
          headline="Our leadership team"
          subheadline={
            <p>
              Oatmeals's leadership team combines decades of experience in private equity, where they honed their skills
              in cost-cutting and maximizing shareholder value.
            </p>
          }
        >
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/1.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Leslie Alexander"
            byline="Co-Founder / CEO"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/2.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Michael Foster"
            byline="Co-Founder / CTO"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/7.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Dries Vincent"
            byline="Business Relations"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/4.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Lindsay Walton"
            byline="Front-end Developer"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/5.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Noor Hasan"
            byline="Designer"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/6.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Tom Cook"
            byline="Director of Product"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/8.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Whitney Francis"
            byline="Copywriter"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/3.webp?w=800&h=1000"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={1000}
              />
            }
            name="Leonard Wu"
            byline="Senior Designer"
          />
        </TeamFourColumnGrid>

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
